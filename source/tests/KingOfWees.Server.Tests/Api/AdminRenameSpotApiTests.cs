using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Admin;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace KingOfWees.Server.Tests.Api;

// Admins rename a place; feedings hold only its id, so the new name shows everywhere at once.
public sealed class AdminRenameSpotApiTests : IAsyncLifetime
{
    private const string AdminKey = "test-admin-key";
    private const string Neighbor = "neighbor-device-key";

    private readonly KingApiFactory _factory = new(settings: [("King:Admin:KeyHash", AdminKeyHasher.Hash(AdminKey))]);
    private HttpClient _public = null!;
    private HttpClient _admin = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        _public = _factory.CreateClient();
        _admin = _factory.CreateClient();
        _admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", AdminKey);
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private async Task<string> Log(string path, object body)
    {
        var response = await _public.PostAsJsonAsync(path, body, Ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString()!;
    }

    // The spot list is oldest first; places added in the same instant would come back in any order.
    private async Task<string> AddSpot(string name)
    {
        var id = await Log("/api/king/spots", new { reporterKey = Neighbor, name, location = new { latitude = 45.523, longitude = -122.677 } });
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        return id;
    }

    private Task<HttpResponseMessage> Rename(HttpClient client, string spotId, string name) =>
        client.PostAsJsonAsync("/api/admin/spots/rename", new { spotId, name }, Ct);

    private async Task<string[]> SpotNames() =>
        [.. (await _public.GetFromJsonAsync<JsonElement>("/api/king/spots", Ct)).EnumerateArray()
            .Select(s => s.GetProperty("name").GetString()!)];

    private async Task<string[]> ErrorCodes(HttpResponseMessage response, string field)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("errors");
        return [.. errors.GetProperty(field).EnumerateArray().Select(e => e.GetString()!)];
    }

    [Fact]
    public async Task A_renamed_place_shows_its_new_trimmed_name_everywhere()
    {
        var porch = await AddSpot("Porch");
        await AddSpot("Corner");
        await Log("/api/king/feedings", new { reporterKey = Neighbor, spotId = porch });

        Assert.Equal(HttpStatusCode.NoContent, (await Rename(_admin, porch, "  Front porch  ")).StatusCode);

        Assert.Equal(["Front porch", "Corner"], await SpotNames());
        var history = await _public.GetFromJsonAsync<JsonElement>("/api/king/history", Ct);
        Assert.Equal("Front porch", history.GetProperty("events")[0].GetProperty("spotName").GetString());
        var status = await _public.GetFromJsonAsync<JsonElement>("/api/king/status", Ct);
        Assert.Equal("Front porch", status.GetProperty("lastFed").GetProperty("spotName").GetString());
    }

    [Fact]
    public async Task A_name_another_place_has_is_refused_ignoring_case_and_spaces()
    {
        var porch = await AddSpot("Porch");
        await AddSpot("Corner");

        Assert.Equal(["name.taken"], await ErrorCodes(await Rename(_admin, porch, " corner "), "name"));
        Assert.Equal(["Porch", "Corner"], await SpotNames());
    }

    [Fact]
    public async Task A_hidden_poster_s_place_still_blocks_its_name()
    {
        var porch = await AddSpot("Porch");
        await Log("/api/king/spots", new { reporterKey = "spammer", name = "Spam spot", location = new { latitude = 45.523, longitude = -122.677 } });
        await _factory.Hidden.HideAsync("spammer", _factory.Clock.GetUtcNow(), Ct);

        Assert.Equal(["name.taken"], await ErrorCodes(await Rename(_admin, porch, "spam spot"), "name"));
        Assert.Equal(["Porch"], await SpotNames());
    }

    [Fact]
    public async Task The_admin_list_has_every_place_marking_hidden_posters_and_never_a_device_key()
    {
        var porch = await AddSpot("Porch");
        var spam = await Log("/api/king/spots", new { reporterKey = "spammer", name = "Spam spot", location = new { latitude = 45.523, longitude = -122.677 } });
        await _factory.Hidden.HideAsync("spammer", _factory.Clock.GetUtcNow(), Ct);

        var response = await _admin.GetAsync("/api/admin/spots", Ct);
        var body = await response.Content.ReadAsStringAsync(Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var places = JsonDocument.Parse(body).RootElement.EnumerateArray()
            .Select(p => (p.GetProperty("id").GetString(), p.GetProperty("name").GetString(), p.GetProperty("hiddenPoster").GetBoolean()));
        Assert.Equal([(porch, "Porch", false), (spam, "Spam spot", true)], places);
        Assert.DoesNotContain("spammer", body);
        Assert.DoesNotContain(Neighbor, body);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _public.GetAsync("/api/admin/spots", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_hidden_poster_s_place_can_be_renamed_and_stays_hidden()
    {
        var spam = await Log("/api/king/spots", new { reporterKey = "spammer", name = "Spam spot", location = new { latitude = 45.523, longitude = -122.677 } });
        await _factory.Hidden.HideAsync("spammer", _factory.Clock.GetUtcNow(), Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await Rename(_admin, spam, "Old porch")).StatusCode);

        Assert.Empty(await SpotNames());
        var listed = await _admin.GetFromJsonAsync<JsonElement>("/api/admin/spots", Ct);
        Assert.Equal("Old porch", listed[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task A_place_can_change_the_case_of_its_own_name()
    {
        var porch = await AddSpot("porch");

        Assert.Equal(HttpStatusCode.NoContent, (await Rename(_admin, porch, "Porch")).StatusCode);
        Assert.Equal(["Porch"], await SpotNames());
    }

    // "Corner" with a zero-width space would look like a second Corner.
    [Fact]
    public async Task A_new_name_is_judged_and_stored_without_invisible_characters()
    {
        var porch = await AddSpot("Porch");
        await AddSpot("Corner");

        Assert.Equal(["name.taken"], await ErrorCodes(await Rename(_admin, porch, "Corner\u200B"), "name"));
        Assert.Equal(HttpStatusCode.NoContent, (await Rename(_admin, porch, "\u202EFront porch")).StatusCode);
        Assert.Equal(["Front porch", "Corner"], await SpotNames());
    }

    [Theory]
    [InlineData("", "name.required")]
    [InlineData("   ", "name.required")]
    [InlineData("\u200B\u202E", "name.required")]
    [InlineData("12345678901234567890123456789012345678901", "name.tooLong")]
    public async Task An_empty_or_too_long_name_is_refused(string name, string code)
    {
        var porch = await AddSpot("Porch");

        Assert.Equal([code], await ErrorCodes(await Rename(_admin, porch, name), "name"));
        Assert.Equal(["Porch"], await SpotNames());
    }

    [Fact]
    public async Task An_unknown_place_is_refused()
    {
        Assert.Equal(["spotId.unknown"], await ErrorCodes(await Rename(_admin, Guid.CreateVersion7().ToString(), "Porch"), "spotId"));
    }

    [Fact]
    public async Task Renaming_requires_the_admin_key()
    {
        var porch = await AddSpot("Porch");

        Assert.Equal(HttpStatusCode.Unauthorized, (await Rename(_public, porch, "Spam")).StatusCode);
        Assert.Equal(["Porch"], await SpotNames());
    }

    [Fact]
    public async Task Renames_are_counted()
    {
        using var renames = new MetricCollector<long>(
            _factory.Services.GetRequiredService<IMeterFactory>(), "KingOfWees", "king.admin.renames");
        var porch = await AddSpot("Porch");

        await Rename(_admin, porch, "Front porch");
        await Rename(_admin, porch, "");

        Assert.Equal(["spot"], renames.GetMeasurementSnapshot().Select(m => m.Tags["target"]));
    }
}
