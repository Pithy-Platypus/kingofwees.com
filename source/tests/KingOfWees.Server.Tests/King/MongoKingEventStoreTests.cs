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
        Assert.Null(found.Location);
        Assert.Null(found.SpotId);
    }

    [Fact]
    public async Task A_feeding_stored_before_sawKing_existed_counts_as_seen()
    {
        var database = mongo.NewDatabase();
        var ct = TestContext.Current.CancellationToken;
        await database.GetCollection<BsonDocument>("events").InsertOneAsync(new BsonDocument
        {
            ["_id"] = "old-2",
            ["Kind"] = "Fed",
            ["OccurredAtUtc"] = new DateTime(2026, 10, 8, 12, 0, 0, DateTimeKind.Utc),
            ["ReporterKey"] = "k",
            ["ReporterName"] = BsonNull.Value,
            ["Foods"] = new BsonArray { "Wet" },
        }, cancellationToken: ct);
        var store = new MongoKingEventStore(database);

        Assert.True((await store.FindAsync("old-2", ct))?.SawKing);
        Assert.Equal("old-2", (await store.GetLatestSightingAsync(ct))?.Id);
    }

    [Fact]
    public async Task A_feeding_stored_before_sawKing_existed_is_counted_as_seen_at_its_spot()
    {
        var database = mongo.NewDatabase();
        var ct = TestContext.Current.CancellationToken;
        await database.GetCollection<BsonDocument>("events").InsertOneAsync(new BsonDocument
        {
            ["_id"] = "old-3",
            ["Kind"] = "Fed",
            ["OccurredAtUtc"] = new DateTime(2026, 10, 8, 12, 0, 0, DateTimeKind.Utc),
            ["ReporterKey"] = "k",
            ["Foods"] = new BsonArray { "Wet" },
            ["SpotId"] = "porch",
        }, cancellationToken: ct);

        var counts = await new MongoKingEventStore(database).CountFeedingsBySpotAsync(since: null, seenOnly: true, ct);

        Assert.Equal([new SpotCount("porch", 1)], counts);
    }

    [Fact]
    public async Task A_sighting_stored_without_the_sawKing_field_is_counted_at_its_place()
    {
        var database = mongo.NewDatabase();
        var ct = TestContext.Current.CancellationToken;
        await database.GetCollection<BsonDocument>("events").InsertOneAsync(new BsonDocument
        {
            ["_id"] = "old-4",
            ["Kind"] = "Seen",
            ["OccurredAtUtc"] = new DateTime(2026, 10, 8, 12, 0, 0, DateTimeKind.Utc),
            ["ReporterKey"] = "k",
            ["Latitude"] = 45.523,
            ["Longitude"] = -122.677,
        }, cancellationToken: ct);

        var counts = await new MongoKingEventStore(database).CountSightingsByPlaceAsync(since: null, ct);

        Assert.Equal([new PlaceCount(new GeoPoint(45.523, -122.677), 1)], counts);
    }
}
