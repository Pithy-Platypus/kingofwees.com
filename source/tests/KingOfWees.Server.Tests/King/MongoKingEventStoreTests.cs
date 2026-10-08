using KingOfWees.Server.King;
using MongoDB.Bson;
using MongoDB.Driver;

namespace KingOfWees.Server.Tests.King;

public sealed class MongoKingEventStoreTests(MongoAppFixture mongo)
    : KingEventStoreContract, IClassFixture<MongoAppFixture>
{
    protected override IKingEventStore CreateStore() => new MongoKingEventStore(mongo.NewDatabase());

    [Fact]
    public async Task A_slice_1_document_with_a_single_food_field_still_reads_with_no_foods()
    {
        var database = mongo.NewDatabase();
        var ct = TestContext.Current.CancellationToken;
        await database.GetCollection<BsonDocument>("events").InsertOneAsync(new BsonDocument
        {
            ["_id"] = "old-1",
            ["Kind"] = "Fed",
            ["OccurredAtUtc"] = new DateTime(2026, 10, 8, 12, 0, 0, DateTimeKind.Utc),
            ["ReporterKey"] = "k",
            ["ReporterName"] = BsonNull.Value,
            ["Food"] = "Wet",
        }, cancellationToken: ct);

        var found = await new MongoKingEventStore(database).FindAsync("old-1", ct);

        Assert.NotNull(found);
        Assert.Empty(found.Foods);
    }
}
