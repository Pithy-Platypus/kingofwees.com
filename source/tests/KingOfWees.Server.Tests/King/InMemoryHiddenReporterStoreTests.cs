using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemoryHiddenReporterStoreTests : HiddenReporterStoreContract
{
    protected override IHiddenReporterStore CreateStore() => new InMemoryHiddenReporterStore();
}
