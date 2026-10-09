using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace KingOfWees.Server.Tests.Api;

// Admins hide one entry or everything from one device, and restore either; the device key never leaves the server.
public sealed class AdminHidingApiTests : IAsyncLifetime
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
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString()!;
    }

    private Task<string> Feed(string device, string? name = null, string? spotId = null) =>
        Log("/api/king/feedings", new { reporterKey = device, reporterName = name, spotId });

    private Task<string> See(string device, string? name = null) =>
        Log("/api/king/sightings", new { reporterKey = device, reporterName = name });

    private Task<string> AddSpot(string device, string name) =>
        Log("/api/king/spots", new { reporterKey = device, name, location = new { latitude = 45.523, longitude = -122.677 } });

    private async Task<string[]> PublicHistoryIds() =>
        [.. (await _public.GetFromJsonAsync<JsonElement>("/api/king/history", Ct)).GetProperty("events").EnumerateArray()
            .Select(e => e.GetProperty("id").GetString()!)];

    private async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }

    [Fact]
    public async Task Hiding_an_entry_takes_it_out_of_public_reads_and_unhiding_brings_it_back()
    {
        var kept = await Feed(Neighbor);
        _factory.Clock.Advance(TimeSpan.FromMinutes(1)); // entries logged in the same instant are ordered by random id bits
        var spam = await See(Neighbor);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.PostAsync($"/api/admin/events/{spam}/hide", null, Ct)).StatusCode);
        Assert.Equal([kept], await PublicHistoryIds());

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/events/{spam}/hide", Ct)).StatusCode);
        Assert.Equal([spam, kept], await PublicHistoryIds());
    }

    [Fact]
    public async Task Hidden_entries_are_listed_newest_first_with_their_spot()
    {
        var porch = await AddSpot(Neighbor, "Porch");
        var older = await Feed(Neighbor, "Sarah", porch);
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        var newer = await See(Neighbor);
        await Feed(Neighbor);
        await _admin.PostAsync($"/api/admin/events/{older}/hide", null, Ct);
        await _admin.PostAsync($"/api/admin/events/{newer}/hide", null, Ct);

        var events = (await Json(await _admin.GetAsync("/api/admin/hidden-entries", Ct))).EnumerateArray().ToList();

        Assert.Equal([newer, older], events.Select(e => e.GetProperty("id").GetString()));
        Assert.Equal("Porch", events[1].GetProperty("spotName").GetString());
        Assert.Equal("Sarah", events[1].GetProperty("reporterName").GetString());
    }

    [Fact]
    public async Task A_device_summary_counts_its_entries_and_spots_before_hiding()
    {
        await AddSpot(Spammer, "Spam spot");
        await Feed(Spammer, "Old name");
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        var newest = await See(Spammer, "Spammy");
        await Feed(Neighbor);

        var device = await Json(await _admin.GetAsync($"/api/admin/events/{newest}/device", Ct));

        Assert.Equal(2, device.GetProperty("entries").GetInt32());
        Assert.Equal(1, device.GetProperty("spots").GetInt32());
        Assert.Equal("Spammy", device.GetProperty("reporterName").GetString());
        Assert.Equal(_factory.Clock.GetUtcNow(), device.GetProperty("newestAt").GetDateTimeOffset());
        Assert.DoesNotContain(Spammer, device.GetRawText());
    }

    [Fact]
    public async Task Hiding_a_device_hides_its_entries_and_spots_and_is_listed_without_its_key()
    {
        var kept = await Feed(Neighbor);
        await AddSpot(Spammer, "Spam spot");
        var spam = await Feed(Spammer, "Spammy");

        var hidden = await Json(await _admin.PostAsync($"/api/admin/events/{spam}/hide-device", null, Ct));

        Assert.Equal([kept], await PublicHistoryIds());
        Assert.Equal(0, (await _public.GetFromJsonAsync<JsonElement>("/api/king/spots", Ct)).GetArrayLength());
        var listed = Assert.Single((await Json(await _admin.GetAsync("/api/admin/hidden", Ct))).EnumerateArray());
        Assert.Equal(hidden.GetRawText(), listed.GetRawText());
        Assert.Equal(_factory.Clock.GetUtcNow(), listed.GetProperty("hiddenAt").GetDateTimeOffset());
        Assert.Equal("Spammy", listed.GetProperty("reporterName").GetString());
        Assert.Equal(1, listed.GetProperty("entries").GetInt32());
        Assert.Equal(1, listed.GetProperty("spots").GetInt32());
        Assert.DoesNotContain(Spammer, listed.GetRawText());
    }

    [Fact]
    public async Task Restoring_a_device_brings_back_everything_including_posts_made_while_hidden()
    {
        var spam = await Feed(Spammer);
        var record = (await Json(await _admin.PostAsync($"/api/admin/events/{spam}/hide-device", null, Ct))).GetProperty("id").GetString();
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        var whileHidden = await See(Spammer);
        Assert.Empty(await PublicHistoryIds());

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/hidden/{record}", Ct)).StatusCode);

        Assert.Equal([whileHidden, spam], await PublicHistoryIds());
        Assert.Equal(0, (await Json(await _admin.GetAsync("/api/admin/hidden", Ct))).GetArrayLength());
    }

    [Theory]
    [InlineData("POST", "/api/admin/events/{0}/hide")]
    [InlineData("DELETE", "/api/admin/events/{0}/hide")]
    [InlineData("POST", "/api/admin/events/{0}/hide-device")]
    [InlineData("GET", "/api/admin/events/{0}/device")]
    [InlineData("DELETE", "/api/admin/hidden/{0}")]
    public async Task Unknown_ids_are_404(string method, string route)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), string.Format(route, Guid.CreateVersion7()));

        Assert.Equal(HttpStatusCode.NotFound, (await _admin.SendAsync(request, Ct)).StatusCode);
    }

    [Fact]
    public async Task Every_admin_route_requires_the_admin_key()
    {
        var spam = await Feed(Spammer);
        var routes = new[]
        {
            (HttpMethod.Post, $"/api/admin/events/{spam}/hide"), (HttpMethod.Delete, $"/api/admin/events/{spam}/hide"),
            (HttpMethod.Post, $"/api/admin/events/{spam}/hide-device"), (HttpMethod.Get, $"/api/admin/events/{spam}/device"),
            (HttpMethod.Get, "/api/admin/hidden-entries"), (HttpMethod.Get, "/api/admin/hidden"),
            (HttpMethod.Delete, "/api/admin/hidden/any"),
        };

        foreach (var (method, route) in routes)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await _public.SendAsync(new HttpRequestMessage(method, route), Ct)).StatusCode);
        }
        Assert.Equal([spam], await PublicHistoryIds());
    }

    [Fact]
    public void Every_endpoint_under_api_admin_carries_the_Admin_policy()
    {
        var admin = _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText?.StartsWith("/api/admin", StringComparison.Ordinal) == true)
            .ToList();

        Assert.NotEmpty(admin);
        Assert.All(admin, e => Assert.Contains(e.Metadata.GetOrderedMetadata<IAuthorizeData>(), a => a.Policy == AdminPolicies.Admin));
    }

    [Fact]
    public async Task Hides_and_restores_are_counted()
    {
        var meterFactory = _factory.Services.GetRequiredService<IMeterFactory>();
        using var hides = new MetricCollector<long>(meterFactory, "KingOfWees", "king.admin.hides");
        using var restores = new MetricCollector<long>(meterFactory, "KingOfWees", "king.admin.restores");
        var entry = await Feed(Neighbor);
        var spam = await Feed(Spammer);

        await _admin.PostAsync($"/api/admin/events/{entry}/hide", null, Ct);
        await _admin.DeleteAsync($"/api/admin/events/{entry}/hide", Ct);
        var record = (await Json(await _admin.PostAsync($"/api/admin/events/{spam}/hide-device", null, Ct))).GetProperty("id").GetString();
        await _admin.DeleteAsync($"/api/admin/hidden/{record}", Ct);

        Assert.Equal(["entry", "device"], hides.GetMeasurementSnapshot().Select(m => m.Tags["target"]));
        Assert.Equal(["entry", "device"], restores.GetMeasurementSnapshot().Select(m => m.Tags["target"]));
    }
}
