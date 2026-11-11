using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class MongoSpotStoreTests(MongoAppFixture mongo) : SpotStoreContract, IClassFixture<MongoAppFixture>
{
    protected override (ISpotStore Spots, IHiddenReporterStore Hidden) CreateStores()
    {
        var database = mongo.NewDatabase();
        return (new MongoSpotStore(database), new MongoHiddenReporterStore(database));
    }
}
