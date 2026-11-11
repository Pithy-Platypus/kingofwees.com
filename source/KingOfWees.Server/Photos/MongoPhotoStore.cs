using KingOfWees.Server.King;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace KingOfWees.Server.Photos;

// Public reads go through Visible(hidden); FindAsync and FindByEventAsync deliberately don't.
public sealed class MongoPhotoStore(IMongoDatabase database) : IPhotoStore
{
    private readonly IMongoCollection<PhotoDocument> _photos = database.GetCollection<PhotoDocument>("photos");

    public Task AddAsync(Photo photo, CancellationToken cancellationToken) =>
        _photos.InsertOneAsync(PhotoDocument.From(photo), cancellationToken: cancellationToken);

    public async Task<Photo?> FindAsync(string id, CancellationToken cancellationToken) =>
        (await _photos.Find(p => p.Id == id).FirstOrDefaultAsync(cancellationToken))?.ToPhoto();

    public async Task<Photo?> FindByEventAsync(string eventId, CancellationToken cancellationToken) =>
        (await _photos.Find(p => p.EventId == eventId).FirstOrDefaultAsync(cancellationToken))?.ToPhoto();

    public async Task<Photo?> FindVisibleAsync(HiddenSets hidden, string id, CancellationToken cancellationToken) =>
        (await _photos.Find(await Visible(hidden, cancellationToken) & Builders<PhotoDocument>.Filter.Eq(p => p.Id, id))
            .FirstOrDefaultAsync(cancellationToken))?.ToPhoto();

    public async Task<IReadOnlyList<Photo>> GetPageAsync(HiddenSets hidden, Photo? before, int count, CancellationToken cancellationToken)
    {
        var olderThanBefore = before is null
            ? FilterDefinition<PhotoDocument>.Empty
            : Paging.OlderThan<PhotoDocument>(p => p.PostedAtUtc, p => p.Id, before.PostedAt.UtcDateTime, before.Id);
        var documents = await _photos.Find(await Visible(hidden, cancellationToken) & olderThanBefore)
            .SortByDescending(p => p.PostedAtUtc)
            .ThenByDescending(p => p.Id)
            .Limit(count)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToPhoto());
    }

    public async Task<IReadOnlyList<Photo>> ForEventsAsync(HiddenSets hidden, IReadOnlyCollection<string> eventIds, CancellationToken cancellationToken)
    {
        var documents = await _photos.Find(await Visible(hidden, cancellationToken) & Builders<PhotoDocument>.Filter.In(p => p.EventId, eventIds))
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToPhoto());
    }

    public async Task<bool> HideAsync(string id, PhotoHiding hiding, CancellationToken cancellationToken)
    {
        var update = Builders<PhotoDocument>.Update
            .Set(p => p.Hidden, true)
            .Set(p => p.HiddenReason, hiding.Reason.ToString())
            .Set(p => p.HiddenNote, hiding.Note)
            .Set(p => p.HiddenAtUtc, hiding.At.UtcDateTime)
            .Set(p => p.HiddenBy, hiding.AdminName);
        return (await _photos.UpdateOneAsync(p => p.Id == id, update, cancellationToken: cancellationToken)).MatchedCount == 1;
    }

    public async Task<bool> ShowAsync(string id, CancellationToken cancellationToken)
    {
        var update = Builders<PhotoDocument>.Update
            .Set(p => p.Hidden, false)
            .Unset(p => p.HiddenReason)
            .Unset(p => p.HiddenNote)
            .Unset(p => p.HiddenAtUtc)
            .Unset(p => p.HiddenBy);
        return (await _photos.UpdateOneAsync(p => p.Id == id, update, cancellationToken: cancellationToken)).MatchedCount == 1;
    }

    public async Task<IReadOnlyList<Photo>> GetHiddenAsync(CancellationToken cancellationToken)
    {
        var documents = await _photos.Find(Builders<PhotoDocument>.Filter.Eq(p => p.Hidden, true))
            .SortByDescending(p => p.PostedAtUtc)
            .ThenByDescending(p => p.Id)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToPhoto());
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken cancellationToken) =>
        (await _photos.DeleteOneAsync(p => p.Id == id, cancellationToken)).DeletedCount == 1;

    // Not hidden itself, not from a hidden device, not on a hidden entry (a shared photo's null EventId is never in the list).
    private static async Task<FilterDefinition<PhotoDocument>> Visible(HiddenSets hidden, CancellationToken cancellationToken)
    {
        var filter = Builders<PhotoDocument>.Filter;
        return filter.Ne(p => p.Hidden, true)
            & filter.Nin(p => p.ReporterKey, await hidden.DevicesAsync(cancellationToken))
            & filter.Nin(p => p.EventId, await hidden.EntriesAsync(cancellationToken));
    }

    // Storage shape: time as a BSON UTC date.
    [BsonIgnoreExtraElements]
    private sealed class PhotoDocument
    {
        [BsonId]
        public required string Id { get; init; }
        public string? EventId { get; init; }
        public required DateTime PostedAtUtc { get; init; }
        public required string ReporterKey { get; init; }
        public string? ReporterName { get; init; }
        public bool Hidden { get; init; }
        // Set together by HideAsync; a photo hidden before reasons existed has Hidden and none of these.
        public string? HiddenReason { get; init; }
        public string? HiddenNote { get; init; }
        public DateTime? HiddenAtUtc { get; init; }
        public string? HiddenBy { get; init; }

        public static PhotoDocument From(Photo p) => new()
        {
            Id = p.Id,
            EventId = p.EventId,
            PostedAtUtc = p.PostedAt.UtcDateTime,
            ReporterKey = p.ReporterKey,
            ReporterName = p.ReporterName,
        };

        public Photo ToPhoto() =>
            new(Id, EventId, BsonTime.Utc(PostedAtUtc), ReporterKey, ReporterName,
                Hidden && HiddenReason is not null && HiddenAtUtc is { } at
                    ? new PhotoHiding(Enum.Parse<HideReason>(HiddenReason), HiddenNote, BsonTime.Utc(at), HiddenBy)
                    : null);
    }
}
