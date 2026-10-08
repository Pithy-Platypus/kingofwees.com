using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemoryKingEventStoreTests : KingEventStoreContract
{
    protected override IKingEventStore CreateStore() => new InMemoryKingEventStore();
}
