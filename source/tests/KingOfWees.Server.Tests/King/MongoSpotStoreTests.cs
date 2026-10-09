using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

public sealed class MongoSpotStoreTests(MongoAppFixture mongo) : SpotStoreContract, IClassFixture<MongoAppFixture>
{
    protected override (ISpotStore Spots, IHiddenReporterStore Hidden) CreateStores()
    {
        var database = mongo.NewDatabase();
        var hidden = new MongoHiddenReporterStore(database);
        return (new MongoSpotStore(database, hidden), hidden);
    }
}
