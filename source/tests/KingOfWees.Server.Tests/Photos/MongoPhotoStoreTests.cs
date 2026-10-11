using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.King;

namespace KingOfWees.Server.Tests.Photos;

public sealed class MongoPhotoStoreTests(MongoAppFixture mongo) : PhotoStoreContract, IClassFixture<MongoAppFixture>
{
    protected override (IPhotoStore Photos, IKingEventStore Events, IHiddenReporterStore Hidden) CreateStores()
    {
        var database = mongo.NewDatabase();
        var hidden = new MongoHiddenReporterStore(database);
        var events = new MongoKingEventStore(database, hidden);
        return (new MongoPhotoStore(database, events, hidden), events, hidden);
    }
}
