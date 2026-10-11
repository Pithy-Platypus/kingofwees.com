using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Admin;
using KingOfWees.Server.King;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace KingOfWees.Server.Tests.Api;

// Admins merge places: every feeding moves to the kept place, the others are deleted for good.
public sealed class AdminMergeSpotsApiTests : IAsyncLifetime
{
    private const string AdminKey = "test-admin-key";
    private const string Neighbor = "neighbor-device-key";
    private const string Spammer = "spammer-device-key";

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
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString()!;
    }

    private Task<string> AddSpot(string name, string device = Neighbor) =>
        Log("/api/king/spots", new { reporterKey = device, name, location = new { latitude = 45.523, longitude = -122.677 } });

    private Task<string> Feed(string spotId, string device = Neighbor) =>
        Log("/api/king/feedings", new { reporterKey = device, spotId });

    private Task<HttpResponseMessage> Merge(HttpClient client, string keepId, string[] mergeIds, string? name = null) =>
        client.PostAsJsonAsync("/api/admin/spots/merge", new { keepId, mergeIds, name }, Ct);

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
    public async Task Every_feeding_moves_to_the_kept_place_and_the_others_are_deleted()
    {
        var porch = await AddSpot("Porch");
        var steps = await AddSpot("Steps");
        var stoop = await AddSpot("Stoop");
        await AddSpot("Corner");
        var atPorch = await Feed(porch);
        var atSteps = await Feed(steps);
        var hiddenAtStoop = await Feed(stoop);
        await _factory.Store.SetHiddenAsync(hiddenAtStoop, hidden: true, Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await Merge(_admin, porch, [steps, stoop])).StatusCode);

        Assert.Equal(["Porch", "Corner"], await SpotNames());
        foreach (var id in new[] { atPorch, atSteps, hiddenAtStoop })
        {
            Assert.Equal(porch, (await _factory.Store.FindAsync(id, Ct))!.SpotId);
        }
        var history = await _public.GetFromJsonAsync<JsonElement>("/api/king/history", Ct);
        Assert.All(history.GetProperty("events").EnumerateArray(), e => Assert.Equal("Porch", e.GetProperty("spotName").GetString()));
        var fed = await _public.GetFromJsonAsync<JsonElement>("/api/king/heat?layer=fed", Ct);
        var cell = Assert.Single(fed.GetProperty("cells").EnumerateArray());
        Assert.Equal(2, cell.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task The_kept_place_can_take_a_new_trimmed_name_even_one_the_merged_places_had()
    {
        var porch = await AddSpot("Porch");
        var lower = await AddSpot("porch");

        Assert.Equal(HttpStatusCode.NoContent, (await Merge(_admin, lower, [porch], "  PORCH ")).StatusCode);

        Assert.Equal(["PORCH"], await SpotNames());
    }

    [Fact]
    public async Task Without_a_new_name_the_kept_place_keeps_its_own()
    {
        var porch = await AddSpot("Porch");
        var steps = await AddSpot("Steps");

        Assert.Equal(HttpStatusCode.NoContent, (await Merge(_admin, porch, [steps])).StatusCode);

        Assert.Equal(["Porch"], await SpotNames());
    }

    [Fact]
    public async Task A_new_name_another_place_has_is_refused_and_nothing_changes()
    {
        var porch = await AddSpot("Porch");
        var steps = await AddSpot("Steps");
        await AddSpot("Corner");
        var atSteps = await Feed(steps);

        Assert.Equal(["name.taken"], await ErrorCodes(await Merge(_admin, porch, [steps], " corner"), "name"));

        Assert.Equal(["Porch", "Steps", "Corner"], await SpotNames());
        Assert.Equal(steps, (await _factory.Store.FindAsync(atSteps, Ct))!.SpotId);
    }

    [Fact]
    public async Task A_hidden_poster_s_places_can_be_merged_and_a_kept_one_stays_hidden()
    {
        var porch = await AddSpot("Porch");
        var spamOne = await AddSpot("Spam one", Spammer);
        var spamTwo = await AddSpot("Spam two", Spammer);
        var neighborsFeeding = await Feed(spamOne);
        await _factory.Hidden.HideAsync(Spammer, _factory.Clock.GetUtcNow(), Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await Merge(_admin, spamTwo, [spamOne])).StatusCode);
        Assert.Equal(["Porch"], await SpotNames());
        Assert.Equal(spamTwo, (await _factory.Store.FindAsync(neighborsFeeding, Ct))!.SpotId);

        Assert.Equal(HttpStatusCode.NoContent, (await Merge(_admin, porch, [spamTwo])).StatusCode);
        Assert.Equal(porch, (await _factory.Store.FindAsync(neighborsFeeding, Ct))!.SpotId);
        var listed = await _admin.GetFromJsonAsync<JsonElement>("/api/admin/spots", Ct);
        Assert.Equal(["Porch"], listed.EnumerateArray().Select(p => p.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task The_admin_list_counts_every_feeding_at_each_place_hidden_or_not()
    {
        var porch = await AddSpot("Porch");
        await AddSpot("Steps");
        var hiddenOne = await Feed(porch);
        await Feed(porch, Spammer);
        await Feed(porch);
        await _factory.Store.SetHiddenAsync(hiddenOne, hidden: true, Ct);
        await _factory.Hidden.HideAsync(Spammer, _factory.Clock.GetUtcNow(), Ct);

        var listed = await _admin.GetFromJsonAsync<JsonElement>("/api/admin/spots", Ct);

        Assert.Equal([("Porch", 3), ("Steps", 0)],
            listed.EnumerateArray().Select(p => (p.GetProperty("name").GetString(), p.GetProperty("feedings").GetInt32())));
    }

    [Fact]
    public async Task A_merge_is_recorded_with_the_names_and_how_many_feedings_moved()
    {
        var porch = await AddSpot("Porch");
        var steps = await AddSpot("Steps");
        var stoop = await AddSpot("Stoop");
        await Feed(porch);
        await Feed(steps);
        await Feed(stoop);
        await Feed(stoop);

        await Merge(_admin, porch, [steps, stoop], "Front porch");

        var record = Assert.Single(await _factory.AdminLog.GetPageAsync(before: null, 10, Ct));
        Assert.Equal(AdminAction.MergePlaces, record.Action);
        Assert.Equivalent(
            new AdminTouched(PlaceName: "Porch", NewName: "Front porch", MergedNames: ["Steps", "Stoop"], Feedings: 3),
            record.Touched, strict: true);
    }

    [Theory]
    [InlineData("keep-unknown", "keepId", "keepId.unknown")]
    [InlineData("no-merge-ids", "mergeIds", "mergeIds.required")]
    [InlineData("keep-in-merge-ids", "mergeIds", "mergeIds.invalid")]
    [InlineData("duplicate-merge-ids", "mergeIds", "mergeIds.invalid")]
    [InlineData("merge-unknown", "mergeIds", "mergeIds.unknown")]
    [InlineData("blank-name", "name", "name.required")]
    [InlineData("long-name", "name", "name.tooLong")]
    public async Task Bad_merges_are_refused_and_nothing_changes(string problem, string field, string code)
    {
        var porch = await AddSpot("Porch");
        var steps = await AddSpot("Steps");
        var (keepId, mergeIds, name) = problem switch
        {
            "keep-unknown" => ("nope", new[] { steps }, (string?)null),
            "no-merge-ids" => (porch, [], null),
            "keep-in-merge-ids" => (porch, [steps, porch], null),
            "duplicate-merge-ids" => (porch, [steps, steps], null),
            "merge-unknown" => (porch, [steps, "nope"], null),
            "blank-name" => (porch, [steps], "   "),
            _ => (porch, [steps], new string('a', 41)),
        };

        Assert.Equal([code], await ErrorCodes(await Merge(_admin, keepId, mergeIds, name), field));
        Assert.Equal(["Porch", "Steps"], await SpotNames());
        Assert.Empty(await _factory.AdminLog.GetPageAsync(before: null, 10, Ct));
    }

    [Fact]
    public async Task Merging_needs_the_key_and_is_counted()
    {
        using var merges = new MetricCollector<long>(
            _factory.Services.GetRequiredService<IMeterFactory>(), "KingOfWees", "king.admin.merges");
        var porch = await AddSpot("Porch");
        var steps = await AddSpot("Steps");

        Assert.Equal(HttpStatusCode.Unauthorized, (await Merge(_public, porch, [steps])).StatusCode);
        Assert.Equal(["Porch", "Steps"], await SpotNames());
        await Merge(_admin, porch, [steps]);

        Assert.Equal(["spot"], merges.GetMeasurementSnapshot().Select(m => m.Tags["target"]));
    }
}
