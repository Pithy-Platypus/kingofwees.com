using KingOfWees.Server.King;
using MongoDB.Bson;
using MongoDB.Driver;
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

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private (IMongoDatabase Database, MongoPhotoStore Photos) Store()
    {
        var database = mongo.NewDatabase();
        var hidden = new MongoHiddenReporterStore(database);
        return (database, new MongoPhotoStore(database, new MongoKingEventStore(database, hidden), hidden));
    }

    // The reader can't tell (a shown photo reads back with no reason either way), but a note left in the document would
    // outlive the audit log's one year.
    [Fact]
    public async Task Showing_a_photo_again_removes_the_reason_note_time_and_name_from_its_document()
    {
        var (database, photos) = Store();
        var photo = new Photo(Guid.CreateVersion7().ToString(), null, DateTimeOffset.UnixEpoch, "device", "Sarah");
        await photos.AddAsync(photo, Ct);
        await photos.HideAsync(photo.Id, new PhotoHiding(HideReason.Rude, "rude words", DateTimeOffset.UnixEpoch, "Wallie"), Ct);

        await photos.ShowAsync(photo.Id, Ct);

        var document = await database.GetCollection<BsonDocument>("photos").Find(new BsonDocument("_id", photo.Id)).SingleAsync(Ct);
        Assert.DoesNotContain(document.Names, n => n.StartsWith("Hidden", StringComparison.Ordinal) && n != "Hidden");
    }

    [Fact]
    public async Task A_photo_hidden_before_reasons_existed_reads_as_hidden_with_no_reason()
    {
        var (database, photos) = Store();
        var id = Guid.CreateVersion7().ToString();
        // Exactly what Slice 6 step 5 wrote: the flag alone.
        await database.GetCollection<BsonDocument>("photos").InsertOneAsync(new BsonDocument
        {
            { "_id", id }, { "EventId", BsonNull.Value }, { "PostedAtUtc", DateTime.UnixEpoch }, { "ReporterKey", "device" },
            { "ReporterName", "Sarah" }, { "Hidden", true },
        }, cancellationToken: Ct);

        Assert.Null(await photos.FindVisibleAsync(id, Ct));
        var listed = Assert.Single(await photos.GetHiddenAsync(Ct));
        Assert.Equal(id, listed.Id);
        Assert.Null(listed.Hiding);
    }
}
