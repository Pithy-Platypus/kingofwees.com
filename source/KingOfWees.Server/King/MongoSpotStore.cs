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
