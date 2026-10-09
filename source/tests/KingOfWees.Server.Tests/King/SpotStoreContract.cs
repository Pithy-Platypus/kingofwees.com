using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Every ISpotStore implementation (real and test double) must pass these.
public abstract class SpotStoreContract
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    // Both share state: the spot store leaves out spots from devices the hidden-reporter store has hidden.
    protected abstract (ISpotStore Spots, IHiddenReporterStore Hidden) CreateStores();

    private ISpotStore CreateStore() => CreateStores().Spots;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Spot NewSpot(string name, int minutesAfterT0, string device = "device-key-1") =>
        new(Guid.CreateVersion7().ToString(), name, new GeoPoint(45.523, -122.677), T0.AddMinutes(minutesAfterT0), device);

    [Fact]
    public async Task Added_spot_is_found_by_id_with_every_field_intact()
    {
        var store = CreateStore();
        var porch = NewSpot("Blue house steps", 0);

        await store.AddAsync(porch, Ct);

        Assert.Equal(porch, await store.FindAsync(porch.Id, Ct));
    }

    [Fact]
    public async Task Find_returns_null_for_unknown_id()
    {
        var store = CreateStore();
        await store.AddAsync(NewSpot("Corner", 0), Ct);

        Assert.Null(await store.FindAsync(Guid.CreateVersion7().ToString(), Ct));
    }

    [Fact]
    public async Task List_returns_every_spot_oldest_first()
    {
        var store = CreateStore();
        var older = NewSpot("Zebra crossing", 1);
        var newer = NewSpot("apple tree", 2);
        await store.AddAsync(newer, Ct);
        await store.AddAsync(older, Ct);

        Assert.Equal([older, newer], await store.ListAsync(Ct));
    }

    [Fact]
    public async Task A_hidden_device_s_spots_leave_the_list_but_are_still_found_by_id()
    {
        var (store, hidden) = CreateStores();
        var porch = NewSpot("Porch", 1, device: "neighbor");
        var spam = NewSpot("Spam spot", 2, device: "spammer");
        await store.AddAsync(porch, Ct);
        await store.AddAsync(spam, Ct);

        await hidden.HideAsync("spammer", T0, Ct);
        var later = NewSpot("More spam", 3, device: "spammer");
        await store.AddAsync(later, Ct);

        Assert.Equal([porch], await store.ListAsync(Ct));
        Assert.Equal(spam, await store.FindAsync(spam.Id, Ct));
    }

    [Fact]
    public async Task Restoring_a_device_brings_its_spots_back()
    {
        var (store, hidden) = CreateStores();
        var spot = NewSpot("Porch", 1, device: "spammer");
        await store.AddAsync(spot, Ct);
        var record = await hidden.HideAsync("spammer", T0, Ct);

        await hidden.RestoreAsync(record.Id, Ct);

        Assert.Equal([spot], await store.ListAsync(Ct));
    }

    [Fact]
    public async Task Spots_are_counted_per_device_hidden_or_not()
    {
        var (store, hidden) = CreateStores();
        await store.AddAsync(NewSpot("Spam 1", 1, device: "spammer"), Ct);
        await store.AddAsync(NewSpot("Spam 2", 2, device: "spammer"), Ct);
        await store.AddAsync(NewSpot("Porch", 3, device: "neighbor"), Ct);
        await hidden.HideAsync("spammer", T0, Ct);

        Assert.Equal(2, await store.CountByReporterAsync("spammer", Ct));
        Assert.Equal(0, await store.CountByReporterAsync("nobody", Ct));
    }
}
