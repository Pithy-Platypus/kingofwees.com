using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemorySpotStoreTests : SpotStoreContract
{
    protected override ISpotStore CreateStore() => new InMemorySpotStore();
}
