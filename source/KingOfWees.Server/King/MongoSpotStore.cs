using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace KingOfWees.Server.King;

// ListAsync leaves out spots from hidden devices; FindAsync deliberately doesn't.
public sealed class MongoSpotStore(IMongoDatabase database, IHiddenReporterStore hiddenReporters) : ISpotStore
{
    private readonly IMongoCollection<SpotDocument> _spots = database.GetCollection<SpotDocument>("spots");

    public Task AddAsync(Spot spot, CancellationToken cancellationToken) =>
        _spots.InsertOneAsync(SpotDocument.From(spot), cancellationToken: cancellationToken);

    public async Task<Spot?> FindAsync(string id, CancellationToken cancellationToken)
    {
        var document = await _spots.Find(s => s.Id == id).FirstOrDefaultAsync(cancellationToken);
        return document?.ToSpot();
    }

    public async Task<bool> RenameAsync(string id, string name, CancellationToken cancellationToken)
    {
        var result = await _spots.UpdateOneAsync(
            s => s.Id == id, Builders<SpotDocument>.Update.Set(s => s.Name, name), cancellationToken: cancellationToken);
        return result.MatchedCount > 0;
    }

    // A street has a handful of spots: compare in memory rather than rely on collation or regex support in DocumentDB.
    public async Task<bool> NameTakenAsync(string name, IReadOnlyCollection<string> exceptIds, CancellationToken cancellationToken)
    {
        var names = await _spots.Find(Builders<SpotDocument>.Filter.Nin(s => s.Id, exceptIds))
            .Project(s => s.Name).ToListAsync(cancellationToken);
        return names.Exists(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<int> CountByReporterAsync(string reporterKey, CancellationToken cancellationToken) =>
        (int)await _spots.CountDocumentsAsync(s => s.ReporterKey == reporterKey, cancellationToken: cancellationToken);

    public async Task<IReadOnlyList<Spot>> ListAsync(CancellationToken cancellationToken)
    {
        var hiddenKeys = (await hiddenReporters.ListAsync(cancellationToken)).Select(h => h.ReporterKey);
        var documents = await _spots.Find(Builders<SpotDocument>.Filter.Nin(s => s.ReporterKey, hiddenKeys))
            .SortBy(s => s.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToSpot());
    }

    public async Task<IReadOnlyList<Spot>> ListEveryAsync(CancellationToken cancellationToken) =>
        (await _spots.Find(Builders<SpotDocument>.Filter.Empty).SortBy(s => s.CreatedAtUtc).ToListAsync(cancellationToken))
            .ConvertAll(d => d.ToSpot());

    public async Task<int> DeleteAsync(IReadOnlyCollection<string> ids, CancellationToken cancellationToken) =>
        (int)(await _spots.DeleteManyAsync(Builders<SpotDocument>.Filter.In(s => s.Id, ids), cancellationToken)).DeletedCount;

    // Coordinates are copied from a GeoPoint and rebuilt into one on read, so they stay rounded.
    [BsonIgnoreExtraElements]
    private sealed class SpotDocument
    {
        [BsonId]
        public required string Id { get; init; }
        public required string Name { get; init; }
        public required double Latitude { get; init; }
        public required double Longitude { get; init; }
        public required DateTime CreatedAtUtc { get; init; }
        public required string ReporterKey { get; init; }

        public static SpotDocument From(Spot s) => new()
        {
            Id = s.Id,
            Name = s.Name,
            Latitude = s.Location.Latitude,
            Longitude = s.Location.Longitude,
            CreatedAtUtc = s.CreatedAt.UtcDateTime,
            ReporterKey = s.ReporterKey,
        };

        public Spot ToSpot() => new(
            Id,
            Name,
            new GeoPoint(Latitude, Longitude),
            new DateTimeOffset(DateTime.SpecifyKind(CreatedAtUtc, DateTimeKind.Utc)),
            ReporterKey);
    }
}
