using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Every ISpotStore implementation (real and test double) must pass these.
public abstract class SpotStoreContract
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    protected abstract ISpotStore CreateStore();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Spot NewSpot(string name, int minutesAfterT0) =>
        new(Guid.CreateVersion7().ToString(), name, new GeoPoint(45.523, -122.677), T0.AddMinutes(minutesAfterT0), "device-key-1");

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
}
