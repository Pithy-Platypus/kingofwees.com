using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemoryKingEventStoreTests : KingEventStoreContract
{
    protected override (IKingEventStore Events, IHiddenReporterStore Hidden) CreateStores()
    {
        var hidden = new InMemoryHiddenReporterStore();
        return (new InMemoryKingEventStore(hidden), hidden);
    }
}
