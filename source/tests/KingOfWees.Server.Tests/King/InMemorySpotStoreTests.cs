using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemorySpotStoreTests : SpotStoreContract
{
    protected override (ISpotStore Spots, IHiddenReporterStore Hidden) CreateStores()
    {
        var hidden = new InMemoryHiddenReporterStore();
        return (new InMemorySpotStore(hidden), hidden);
    }
}
