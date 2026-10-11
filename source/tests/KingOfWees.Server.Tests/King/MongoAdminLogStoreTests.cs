using KingOfWees.Server.Admin;
using MongoDB.Bson;
using MongoDB.Driver;

namespace KingOfWees.Server.Tests.King;

// Run on local Mongo only: never point KING_TEST_MONGO at the production cluster.
public sealed class MongoAdminLogStoreTests(MongoAppFixture mongo)
    : AdminLogStoreContract, IClassFixture<MongoAppFixture>
{
    protected override IAdminLogStore CreateStore() => new MongoAdminLogStore(mongo.NewDatabase());

    [Fact]
    public async Task Records_are_deleted_by_the_database_a_year_after_they_were_written()
    {
        var database = mongo.NewDatabase();
        await new MongoAdminLogStore(database).AppendAsync(Record("r1", T0), Ct);

        var indexes = await (await database.GetCollection<BsonDocument>("adminLog").Indexes.ListAsync(Ct)).ToListAsync(Ct);

        var ttl = Assert.Single(indexes, i => i.Contains("expireAfterSeconds"));
        Assert.Equal(new BsonDocument("AtUtc", 1), ttl["key"].AsBsonDocument);
        Assert.Equal(TimeSpan.FromDays(365).TotalSeconds, ttl["expireAfterSeconds"].ToDouble());
    }

    [Fact]
    public async Task The_time_is_stored_as_a_date_because_expiry_ignores_any_other_type()
    {
        var database = mongo.NewDatabase();
        await new MongoAdminLogStore(database).AppendAsync(Record("r1", T0), Ct);

        var stored = await database.GetCollection<BsonDocument>("adminLog").Find(FilterDefinition<BsonDocument>.Empty).SingleAsync(Ct);

        Assert.Equal(BsonType.DateTime, stored["AtUtc"].BsonType);
    }
}
