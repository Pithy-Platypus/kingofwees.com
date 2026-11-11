using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// One request, one load: what was hidden while the request ran shows up in the next request's sets, not this one's.
public sealed class HiddenSetsTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_device_hidden_during_a_request_is_left_out_from_the_next_request_on()
    {
        var hidden = new InMemoryHiddenReporterStore();
        var events = new InMemoryKingEventStore();
        var thisRequest = new HiddenSets(hidden, events);
        Assert.Empty(await thisRequest.DevicesAsync(Ct));

        await hidden.HideAsync("spammer", DateTimeOffset.UnixEpoch, Ct);

        Assert.Empty(await thisRequest.DevicesAsync(Ct));
        Assert.Equal(["spammer"], await new HiddenSets(hidden, events).DevicesAsync(Ct));
    }

    [Fact]
    public async Task An_entry_hidden_during_a_request_is_left_out_from_the_next_request_on()
    {
        var hidden = new InMemoryHiddenReporterStore();
        var events = new InMemoryKingEventStore();
        var entry = new KingEvent("e-1", KingEventKind.Seen, DateTimeOffset.UnixEpoch, "device", null, [], true, null, null);
        await events.AddAsync(entry, Ct);
        var thisRequest = new HiddenSets(hidden, events);
        Assert.Empty(await thisRequest.EntriesAsync(Ct));

        await events.SetHiddenAsync(entry.Id, true, Ct);

        Assert.Empty(await thisRequest.EntriesAsync(Ct));
        Assert.Equal(["e-1"], await new HiddenSets(hidden, events).EntriesAsync(Ct));
    }
}
