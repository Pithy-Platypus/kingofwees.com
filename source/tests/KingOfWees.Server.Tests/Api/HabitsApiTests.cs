using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.Api;

public sealed class HabitsApiTests : IAsyncDisposable
{
    private readonly KingApiFactory _factory = new();
    private int _nextId;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private DateTimeOffset Now => _factory.Clock.GetUtcNow();

    private async Task<string> Add(
        KingEventKind kind, TimeSpan ago, bool sawKing = true, IReadOnlyList<Food>? foods = null, string reporterKey = "device-key-1",
        string? name = "Amy")
    {
        var id = $"event-{_nextId++}";
        await _factory.Store.AddAsync(
            new KingEvent(id, kind, Now - ago, reporterKey, name, foods ?? [], sawKing, "porch", new GeoPoint(45.523, -122.677)), Ct);
        return id;
    }

    private async Task<(string Name, int Feedings)[]> Court(string query = "")
    {
        var response = await _factory.CreateClient().GetAsync($"/api/king/habits{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        return [.. json.GetProperty("court").EnumerateArray().Select(c => (c.GetProperty("name").GetString()!, c.GetProperty("feedings").GetInt32()))];
    }

    private async Task<JsonElement[]> Entries()
    {
        var response = await _factory.CreateClient().GetAsync("/api/king/habits", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        return [.. json.GetProperty("entries").EnumerateArray()];
    }

    [Fact]
    public async Task Lists_every_visible_entry_newest_first_with_only_its_time_kind_seen_flag_and_foods()
    {
        await Add(KingEventKind.Fed, TimeSpan.FromHours(2), foods: [Food.Wet, Food.Treats]);
        await Add(KingEventKind.Seen, TimeSpan.FromHours(1));
        await Add(KingEventKind.Fed, TimeSpan.FromHours(3), sawKing: false, foods: [Food.Dry]);

        var entries = await Entries();

        Assert.Equal(
            [
                (Now.AddHours(-1), "seen", true, ""),
                (Now.AddHours(-2), "fed", true, "wet,treats"),
                (Now.AddHours(-3), "fed", false, "dry"),
            ],
            entries.Select(e => (
                e.GetProperty("occurredAt").GetDateTimeOffset(),
                e.GetProperty("kind").GetString(),
                e.GetProperty("sawKing").GetBoolean(),
                string.Join(",", e.GetProperty("foods").EnumerateArray().Select(f => f.GetString())))));
        // Nothing that could name a neighbor, a place or an entry travels with the chart data.
        Assert.All(entries, e => Assert.Equal(["foods", "kind", "occurredAt", "sawKing"], e.EnumerateObject().Select(p => p.Name).Order()));
    }

    [Fact]
    public async Task Leaves_out_hidden_entries_and_hidden_devices()
    {
        await Add(KingEventKind.Fed, TimeSpan.FromHours(1));
        var hidden = await Add(KingEventKind.Fed, TimeSpan.FromHours(2));
        await Add(KingEventKind.Seen, TimeSpan.FromHours(3), reporterKey: "spammer");
        await _factory.Store.SetHiddenAsync(hidden, hidden: true, Ct);
        await _factory.Hidden.HideAsync("spammer", Now, Ct);

        var entries = await Entries();

        Assert.Equal([Now.AddHours(-1)], entries.Select(e => e.GetProperty("occurredAt").GetDateTimeOffset()));
    }

    [Fact]
    public async Task The_court_ranks_the_three_named_neighbors_with_most_feedings_ties_by_name()
    {
        foreach (var (name, feedings) in new[] { ("Amy", 3), ("Wallie", 3), ("Devon", 1), ("Callie", 2), ("Hannah", 2) })
        {
            for (var i = 0; i < feedings; i++)
            {
                await Add(KingEventKind.Fed, TimeSpan.FromHours(_nextId), name: name, reporterKey: $"device-{name}");
            }
        }
        await Add(KingEventKind.Seen, TimeSpan.FromHours(1), name: "Devon", reporterKey: "device-Devon");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(2), name: null, reporterKey: "device-anon");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(3), name: null, reporterKey: "device-anon");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(4), name: null, reporterKey: "device-anon");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(5), name: null, reporterKey: "device-anon");

        var court = await Court();

        // Sightings and unnamed feedings don't count; a tie goes alphabetically; only three seats.
        Assert.Equal([("Amy", 3), ("Wallie", 3), ("Callie", 2)], court);
    }

    [Fact]
    public async Task The_court_follows_the_days_asked_for_while_the_entries_stay_all_time()
    {
        await Add(KingEventKind.Fed, TimeSpan.FromDays(1), name: "Amy");
        await Add(KingEventKind.Fed, TimeSpan.FromDays(10), name: "Wallie");
        await Add(KingEventKind.Fed, TimeSpan.FromDays(11), name: "Wallie");

        Assert.Equal([("Amy", 1)], await Court("?days=7"));
        Assert.Equal([("Wallie", 2), ("Amy", 1)], await Court("?days=30"));
        Assert.Equal([("Wallie", 2), ("Amy", 1)], await Court());
        var response = await _factory.CreateClient().GetAsync("/api/king/habits?days=7", Ct);
        Assert.Equal(3, (await Json(response)).GetProperty("entries").GetArrayLength());
    }

    [Fact]
    public async Task Days_must_be_7_or_30()
    {
        var response = await _factory.CreateClient().GetAsync("/api/king/habits?days=5", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("days.invalid", ErrorCodes(await Json(response)));
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) => await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    private static IEnumerable<string?> ErrorCodes(JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());

    [Fact]
    public async Task The_court_leaves_out_hidden_entries_and_hidden_devices()
    {
        await Add(KingEventKind.Fed, TimeSpan.FromHours(1), name: "Amy");
        var hidden = await Add(KingEventKind.Fed, TimeSpan.FromHours(2), name: "Amy");
        await Add(KingEventKind.Fed, TimeSpan.FromHours(3), name: "Spammer", reporterKey: "spammer");
        await _factory.Store.SetHiddenAsync(hidden, hidden: true, Ct);
        await _factory.Hidden.HideAsync("spammer", Now, Ct);

        Assert.Equal([("Amy", 1)], await Court());
    }

    [Fact]
    public async Task Stops_at_the_newest_entries_when_there_are_more_than_the_cap()
    {
        for (var i = 0; i <= HabitsView.MaxEntries; i++)
        {
            await Add(KingEventKind.Fed, TimeSpan.FromMinutes(i));
        }

        var entries = await Entries();

        Assert.Equal(HabitsView.MaxEntries, entries.Length);
        Assert.Equal(Now, entries[0].GetProperty("occurredAt").GetDateTimeOffset());
        Assert.Equal(Now.AddMinutes(-(HabitsView.MaxEntries - 1)), entries[^1].GetProperty("occurredAt").GetDateTimeOffset());
    }
}
