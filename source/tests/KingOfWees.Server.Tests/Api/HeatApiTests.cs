using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.Api;

public sealed class HeatApiTests : IAsyncDisposable
{
    private static readonly GeoPoint PorchPlace = new(45.523, -122.677);
    private static readonly GeoPoint StepsPlace = new(45.525, -122.679);
    private static readonly GeoPoint Elsewhere = new(45.521, -122.675);

    private readonly KingApiFactory _factory = new();
    private int _nextId;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private DateTimeOffset Now => _factory.Clock.GetUtcNow();

    private async Task AddSpots()
    {
        await _factory.Spots.AddAsync(new Spot("porch", "Porch", PorchPlace, Now, "device-key-1"), Ct);
        await _factory.Spots.AddAsync(new Spot("steps", "Steps", StepsPlace, Now, "device-key-1"), Ct);
    }

    private Task Add(KingEventKind kind, TimeSpan ago, bool sawKing = true, string? spotId = null, GeoPoint? location = null) =>
        _factory.Store.AddAsync(
            new KingEvent($"event-{_nextId++}", kind, Now - ago, "device-key-1", null, [], sawKing, spotId, location), Ct);

    private async Task<HttpResponseMessage> Heat(string query) =>
        await _factory.CreateClient().GetAsync($"/api/king/heat{query}", Ct);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    private async Task<(double Latitude, double Longitude, int Count, string? SpotName)[]> Cells(string query)
    {
        var response = await Heat(query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return
        [
            .. (await Json(response)).GetProperty("cells").EnumerateArray().Select(c => (
                c.GetProperty("location").GetProperty("latitude").GetDouble(),
                c.GetProperty("location").GetProperty("longitude").GetDouble(),
                c.GetProperty("count").GetInt32(),
                c.TryGetProperty("spotName", out var name) ? name.GetString() : null)),
        ];
    }

    private static IEnumerable<string?> ErrorCodes(JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());

    [Fact]
    public async Task Seen_layer_counts_sightings_and_seen_feedings_per_block_most_first()
    {
        await AddSpots();
        await Add(KingEventKind.Seen, TimeSpan.FromHours(1), location: Elsewhere);
        await Add(KingEventKind.Seen, TimeSpan.FromHours(2), location: PorchPlace);
        await Add(KingEventKind.Fed, TimeSpan.FromHours(3), spotId: "porch");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(4), spotId: "porch", sawKing: false);
        await Add(KingEventKind.Fed, TimeSpan.FromHours(5), spotId: "steps", sawKing: false);

        var cells = await Cells("?layer=seen");

        Assert.Equal(
            [(PorchPlace.Latitude, PorchPlace.Longitude, 2, null), (Elsewhere.Latitude, Elsewhere.Longitude, 1, null)],
            cells);
    }

    [Fact]
    public async Task Fed_layer_counts_every_feeding_per_spot_with_its_name_most_first()
    {
        await AddSpots();
        await Add(KingEventKind.Fed, TimeSpan.FromHours(1), spotId: "steps");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(2), spotId: "steps", sawKing: false);
        await Add(KingEventKind.Fed, TimeSpan.FromHours(3), spotId: "porch");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(4));
        await Add(KingEventKind.Seen, TimeSpan.FromHours(5), location: Elsewhere);

        var cells = await Cells("?layer=fed");

        Assert.Equal(
            [(StepsPlace.Latitude, StepsPlace.Longitude, 2, "Steps"), (PorchPlace.Latitude, PorchPlace.Longitude, 1, "Porch")],
            cells);
    }

    [Fact]
    public async Task Feedings_at_a_spot_that_no_longer_exists_are_left_out()
    {
        await AddSpots();
        await Add(KingEventKind.Fed, TimeSpan.FromHours(1), spotId: "gone");

        Assert.Empty(await Cells("?layer=fed"));
        Assert.Empty(await Cells("?layer=seen"));
    }

    [Theory]
    [InlineData("&days=7", 2)]
    [InlineData("&days=30", 3)]
    [InlineData("", 4)]
    public async Task Days_counts_back_from_now_including_the_boundary(string days, int expected)
    {
        await Add(KingEventKind.Seen, TimeSpan.FromDays(1), location: Elsewhere);
        await Add(KingEventKind.Seen, TimeSpan.FromDays(7), location: Elsewhere);
        await Add(KingEventKind.Seen, TimeSpan.FromDays(7) + TimeSpan.FromMinutes(1), location: Elsewhere);
        await Add(KingEventKind.Seen, TimeSpan.FromDays(100), location: Elsewhere);

        Assert.Equal(expected, (await Cells($"?layer=seen{days}")).Single().Count);
    }

    [Fact]
    public async Task Days_also_limits_the_fed_layer()
    {
        await AddSpots();
        await Add(KingEventKind.Fed, TimeSpan.FromDays(1), spotId: "porch");
        await Add(KingEventKind.Fed, TimeSpan.FromDays(8), spotId: "porch");

        Assert.Equal(1, (await Cells("?layer=fed&days=7")).Single().Count);
    }

    [Theory]
    [InlineData("", "layer.invalid")]
    [InlineData("?layer=everything", "layer.invalid")]
    [InlineData("?layer=seen&days=14", "days.invalid")]
    [InlineData("?layer=seen&days=0", "days.invalid")]
    public async Task Bad_queries_are_rejected_with_an_error_code(string query, string code)
    {
        var response = await Heat(query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(code, ErrorCodes(await Json(response)));
    }
}
