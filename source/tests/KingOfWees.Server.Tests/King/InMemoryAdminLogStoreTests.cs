using KingOfWees.Server.Admin;

namespace KingOfWees.Server.Tests.King;

public sealed class InMemoryAdminLogStoreTests : AdminLogStoreContract
{
    protected override IAdminLogStore CreateStore() => new InMemoryAdminLogStore();
}
