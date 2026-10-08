using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Every IKingEventStore implementation (real and test double) must pass these.
public abstract class KingEventStoreContract
{
    // Mongo stores milliseconds; contract times stay on whole seconds so every store round-trips exactly.
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    protected abstract IKingEventStore CreateStore();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static KingEvent Event(KingEventKind kind, int minutesAfterT0, string? name = "Jamie", Food[]? foods = null) =>
        new(Guid.CreateVersion7().ToString(), kind, T0.AddMinutes(minutesAfterT0), "device-key-1", name, foods ?? []);

    // Records holding lists compare the lists by reference, so compare structure instead.
    private static void AssertSameEvent(KingEvent? expected, KingEvent? actual) => Assert.Equivalent(expected, actual, strict: true);

    [Fact]
    public async Task Added_event_is_found_by_id_with_every_field_intact()
    {
        var store = CreateStore();
        var fed = Event(KingEventKind.Fed, 0, name: "Jamie", foods: [Food.Wet, Food.Treats]);

        await store.AddAsync(fed, Ct);

        AssertSameEvent(fed, await store.FindAsync(fed.Id, Ct));
    }

    [Fact]
    public async Task Optional_fields_round_trip_as_null()
    {
        var store = CreateStore();
        var seen = Event(KingEventKind.Seen, 0, name: null, foods: []);

        await store.AddAsync(seen, Ct);

        AssertSameEvent(seen, await store.FindAsync(seen.Id, Ct));
    }

    [Fact]
    public async Task Find_returns_null_for_unknown_id()
    {
        var store = CreateStore();
        // A non-empty store, so a lookup that ignores the id can't pass by accident.
        await store.AddAsync(Event(KingEventKind.Fed, 0), Ct);

        Assert.Null(await store.FindAsync(Guid.CreateVersion7().ToString(), Ct));
    }

    [Fact]
    public async Task Latest_is_the_newest_event_of_the_requested_kind_only()
    {
        var store = CreateStore();
        var olderFed = Event(KingEventKind.Fed, 1);
        var newerFed = Event(KingEventKind.Fed, 3);
        var newestSeen = Event(KingEventKind.Seen, 4);
        // Insert out of time order so insertion order can't masquerade as time order.
        await store.AddAsync(newerFed, Ct);
        await store.AddAsync(newestSeen, Ct);
        await store.AddAsync(olderFed, Ct);

        AssertSameEvent(newerFed, await store.GetLatestAsync(KingEventKind.Fed, Ct));
        AssertSameEvent(newestSeen, await store.GetLatestAsync(KingEventKind.Seen, Ct));
    }

    [Fact]
    public async Task Latest_is_null_when_no_event_of_that_kind_exists()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Seen, 0), Ct);

        Assert.Null(await store.GetLatestAsync(KingEventKind.Fed, Ct));
    }

    [Fact]
    public async Task Recent_is_newest_first_and_limited_to_count()
    {
        var store = CreateStore();
        var first = Event(KingEventKind.Fed, 1);
        var second = Event(KingEventKind.Seen, 2);
        var third = Event(KingEventKind.Fed, 3);
        await store.AddAsync(second, Ct);
        await store.AddAsync(third, Ct);
        await store.AddAsync(first, Ct);

        var recent = await store.GetRecentAsync(2, Ct);

        Assert.Equal([third.Id, second.Id], recent.Select(e => e.Id));
        AssertSameEvent(third, recent[0]);
    }

    [Fact]
    public async Task Delete_removes_the_event_and_reports_whether_it_existed()
    {
        var store = CreateStore();
        var fed = Event(KingEventKind.Fed, 0);
        await store.AddAsync(fed, Ct);

        Assert.True(await store.DeleteAsync(fed.Id, Ct));
        Assert.Null(await store.FindAsync(fed.Id, Ct));
        Assert.False(await store.DeleteAsync(fed.Id, Ct));
    }
}
