using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class MongoHiddenReporterStoreTests(MongoAppFixture mongo)
    : HiddenReporterStoreContract, IClassFixture<MongoAppFixture>
{
    protected override IHiddenReporterStore CreateStore() => new MongoHiddenReporterStore(mongo.NewDatabase());
}
