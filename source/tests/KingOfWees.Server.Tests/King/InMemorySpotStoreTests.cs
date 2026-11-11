using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemorySpotStoreTests : SpotStoreContract
{
    protected override (ISpotStore Spots, IHiddenReporterStore Hidden) CreateStores()
    {
        return (new InMemorySpotStore(), new InMemoryHiddenReporterStore());
    }
}
