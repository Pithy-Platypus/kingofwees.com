using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.Api;

public sealed class HistoryApiTests : IAsyncDisposable
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly KingApiFactory _factory = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    // Seeded straight into the store so times are spread out and known.
    private async Task<KingEvent[]> SeedFeedings(int count, string? spotId = null)
    {
        var events = Enumerable.Range(0, count)
            .Select(i => new KingEvent(
                $"event-{i:D3}", KingEventKind.Fed, T0.AddMinutes(i), "device-key-1", "Jamie", [Food.Wet], true, spotId, null))
            .ToArray();
        foreach (var e in events) await _factory.Store.AddAsync(e, Ct);
        return events;
    }

    private async Task<HttpResponseMessage> History(string query = "") =>
        await _factory.CreateClient().GetAsync($"/api/king/history{query}", Ct);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    private static string?[] Ids(JsonElement page) =>
        [.. page.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("id").GetString())];

    private static IEnumerable<string?> ErrorCodes(JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());

    [Fact]
    public async Task First_page_is_newest_first_with_a_cursor_to_the_next()
    {
        var events = await SeedFeedings(3);

        var response = await History("?limit=2");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await Json(response);
        Assert.Equal([events[2].Id, events[1].Id], Ids(page));
        Assert.Equal(events[1].Id, page.GetProperty("next").GetString());
    }

    [Fact]
    public async Task Following_the_cursor_returns_the_rest_and_no_further_cursor()
    {
        var events = await SeedFeedings(3);

        var page = await Json(await History($"?limit=2&before={events[1].Id}"));

        Assert.Equal([events[0].Id], Ids(page));
        Assert.Equal(JsonValueKind.Null, page.GetProperty("next").ValueKind);
    }

    [Fact]
    public async Task A_page_that_ends_exactly_at_the_oldest_event_has_no_cursor()
    {
        var events = await SeedFeedings(2);

        var page = await Json(await History("?limit=2"));

        Assert.Equal([events[1].Id, events[0].Id], Ids(page));
        Assert.Equal(JsonValueKind.Null, page.GetProperty("next").ValueKind);
    }

    [Fact]
    public async Task Pages_hold_fifty_events_by_default()
    {
        await SeedFeedings(51);

        var page = await Json(await History());

        Assert.Equal(50, Ids(page).Length);
        Assert.NotEqual(JsonValueKind.Null, page.GetProperty("next").ValueKind);
    }

    [Fact]
    public async Task A_feeding_shows_its_spot_name_and_place()
    {
        var spot = new Spot("spot-1", "Porch", new GeoPoint(45.523, -122.677), T0, "device-key-1");
        await _factory.Spots.AddAsync(spot, Ct);
        await SeedFeedings(1, spotId: spot.Id);

        var shown = (await Json(await History())).GetProperty("events")[0];

        Assert.Equal("Porch", shown.GetProperty("spotName").GetString());
        Assert.Equal(45.523, shown.GetProperty("location").GetProperty("latitude").GetDouble());
        Assert.False(shown.TryGetProperty("reporterKey", out _));
    }

    [Theory]
    [InlineData("?limit=0", "limit.outOfRange")]
    [InlineData("?limit=101", "limit.outOfRange")]
    [InlineData("?before=no-such-event", "before.unknown")]
    public async Task Bad_queries_are_rejected_with_an_error_code(string query, string code)
    {
        await SeedFeedings(1);

        var response = await History(query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(code, ErrorCodes(await Json(response)));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(100)]
    public async Task The_smallest_and_largest_pages_are_accepted(int limit)
    {
        var response = await History($"?limit={limit}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
