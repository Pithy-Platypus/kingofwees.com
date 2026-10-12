using KingOfWees.Server.King;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace KingOfWees.Server.Photos;

// Public reads go through Visible(); FindAsync and FindByEventAsync deliberately don't.
public sealed class MongoPhotoStore(IMongoDatabase database, IKingEventStore events, IHiddenReporterStore hiddenReporters) : IPhotoStore
{
    private readonly IMongoCollection<PhotoDocument> _photos = database.GetCollection<PhotoDocument>("photos");

    public Task AddAsync(Photo photo, CancellationToken cancellationToken) =>
        _photos.InsertOneAsync(PhotoDocument.From(photo), cancellationToken: cancellationToken);

    public async Task<Photo?> FindAsync(string id, CancellationToken cancellationToken) =>
        (await _photos.Find(p => p.Id == id).FirstOrDefaultAsync(cancellationToken))?.ToPhoto();

    public async Task<Photo?> FindByEventAsync(string eventId, CancellationToken cancellationToken) =>
        (await _photos.Find(p => p.EventId == eventId).FirstOrDefaultAsync(cancellationToken))?.ToPhoto();

    public async Task<Photo?> FindVisibleAsync(string id, CancellationToken cancellationToken) =>
        (await _photos.Find(await Visible(cancellationToken) & Builders<PhotoDocument>.Filter.Eq(p => p.Id, id))
            .FirstOrDefaultAsync(cancellationToken))?.ToPhoto();

    public async Task<IReadOnlyList<Photo>> GetPageAsync(Photo? before, int count, CancellationToken cancellationToken)
    {
        var filter = Builders<PhotoDocument>.Filter;
        var olderThanBefore = before is null
            ? filter.Empty
            : filter.Lt(p => p.PostedAtUtc, before.PostedAt.UtcDateTime)
              | (filter.Eq(p => p.PostedAtUtc, before.PostedAt.UtcDateTime) & filter.Lt(p => p.Id, before.Id));
        var documents = await _photos.Find(await Visible(cancellationToken) & olderThanBefore)
            .SortByDescending(p => p.PostedAtUtc)
            .ThenByDescending(p => p.Id)
            .Limit(count)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToPhoto());
    }

    public async Task<IReadOnlyList<Photo>> ForEventsAsync(IReadOnlyCollection<string> eventIds, CancellationToken cancellationToken)
    {
        var documents = await _photos.Find(await Visible(cancellationToken) & Builders<PhotoDocument>.Filter.In(p => p.EventId, eventIds))
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToPhoto());
    }

    public async Task<bool> SetHiddenAsync(string id, bool hidden, CancellationToken cancellationToken)
    {
        var result = await _photos.UpdateOneAsync(
            p => p.Id == id, Builders<PhotoDocument>.Update.Set(p => p.Hidden, hidden), cancellationToken: cancellationToken);
        return result.MatchedCount == 1;
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
    private async Task<FilterDefinition<PhotoDocument>> Visible(CancellationToken cancellationToken)
    {
        var hiddenKeys = (await hiddenReporters.ListAsync(cancellationToken)).Select(h => h.ReporterKey);
        var hiddenEntries = (await events.GetHiddenEntriesAsync(cancellationToken)).Select(e => e.Id);
        var filter = Builders<PhotoDocument>.Filter;
        return filter.Ne(p => p.Hidden, true) & filter.Nin(p => p.ReporterKey, hiddenKeys) & filter.Nin(p => p.EventId, hiddenEntries);
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

        public static PhotoDocument From(Photo p) => new()
        {
            Id = p.Id,
            EventId = p.EventId,
            PostedAtUtc = p.PostedAt.UtcDateTime,
            ReporterKey = p.ReporterKey,
            ReporterName = p.ReporterName,
        };

        public Photo ToPhoto() =>
            new(Id, EventId, new DateTimeOffset(DateTime.SpecifyKind(PostedAtUtc, DateTimeKind.Utc)), ReporterKey, ReporterName);
    }
}
