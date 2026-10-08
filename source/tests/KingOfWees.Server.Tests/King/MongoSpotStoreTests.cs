using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class MongoSpotStoreTests(MongoAppFixture mongo) : SpotStoreContract, IClassFixture<MongoAppFixture>
{
    protected override ISpotStore CreateStore() => new MongoSpotStore(mongo.NewDatabase());
}
