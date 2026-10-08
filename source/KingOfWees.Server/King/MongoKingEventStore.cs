using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace KingOfWees.Server.King;

public sealed class MongoKingEventStore(IMongoDatabase database) : IKingEventStore
{
    private readonly IMongoCollection<KingEventDocument> _events =
        database.GetCollection<KingEventDocument>("events");

    public Task AddAsync(KingEvent kingEvent, CancellationToken cancellationToken) =>
        _events.InsertOneAsync(KingEventDocument.From(kingEvent), cancellationToken: cancellationToken);

    public async Task<KingEvent?> FindAsync(string id, CancellationToken cancellationToken)
    {
        var document = await _events.Find(e => e.Id == id).FirstOrDefaultAsync(cancellationToken);
        return document?.ToEvent();
    }

    public async Task<KingEvent?> GetLatestAsync(KingEventKind kind, CancellationToken cancellationToken)
    {
        var document = await _events.Find(e => e.Kind == kind.ToString())
            .SortByDescending(e => e.OccurredAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        return document?.ToEvent();
    }

    // Sightings are always stored as seen, so one flag covers both kinds; Ne also matches documents written before the flag.
    public async Task<KingEvent?> GetLatestSightingAsync(CancellationToken cancellationToken)
    {
        var document = await _events.Find(Builders<KingEventDocument>.Filter.Ne(e => e.SawKing, false))
            .SortByDescending(e => e.OccurredAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        return document?.ToEvent();
    }

    public async Task<IReadOnlyList<KingEvent>> GetPageAsync(KingEvent? before, int count, CancellationToken cancellationToken)
    {
        var filter = Builders<KingEventDocument>.Filter;
        var olderThanBefore = before is null
            ? filter.Empty
            : filter.Lt(e => e.OccurredAtUtc, before.OccurredAt.UtcDateTime)
              | (filter.Eq(e => e.OccurredAtUtc, before.OccurredAt.UtcDateTime) & filter.Lt(e => e.Id, before.Id));
        var documents = await _events.Find(olderThanBefore)
            .SortByDescending(e => e.OccurredAtUtc)
            .ThenByDescending(e => e.Id)
            .Limit(count)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToEvent());
    }

    // Coordinates were rounded before storing, so equal blocks group on exact equality.
    public async Task<IReadOnlyList<PlaceCount>> CountSightingsByPlaceAsync(DateTimeOffset? since, CancellationToken cancellationToken)
    {
        var filter = Builders<KingEventDocument>.Filter;
        var groups = await _events.Aggregate()
            .Match(Since(since) & filter.Ne(e => e.SawKing, false) & filter.Ne(e => e.Latitude, null))
            .Group(e => new { e.Latitude, e.Longitude }, g => new { g.Key.Latitude, g.Key.Longitude, Count = g.Count() })
            .ToListAsync(cancellationToken);
        return groups.ConvertAll(g => new PlaceCount(new GeoPoint(g.Latitude!.Value, g.Longitude!.Value), g.Count));
    }

    public async Task<IReadOnlyList<SpotCount>> CountFeedingsBySpotAsync(
        DateTimeOffset? since, bool seenOnly, CancellationToken cancellationToken)
    {
        var filter = Builders<KingEventDocument>.Filter;
        var groups = await _events.Aggregate()
            .Match(Since(since) & filter.Ne(e => e.SpotId, null) & (seenOnly ? filter.Ne(e => e.SawKing, false) : filter.Empty))
            .Group(e => e.SpotId, g => new { SpotId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        return groups.ConvertAll(g => new SpotCount(g.SpotId!, g.Count));
    }

    private static FilterDefinition<KingEventDocument> Since(DateTimeOffset? since) =>
        since is { } start
            ? Builders<KingEventDocument>.Filter.Gte(e => e.OccurredAtUtc, start.UtcDateTime)
            : FilterDefinition<KingEventDocument>.Empty;

    public async Task<bool> RenameAsync(string id, string? reporterName, CancellationToken cancellationToken)
    {
        var result = await _events.UpdateOneAsync(
            e => e.Id == id, Builders<KingEventDocument>.Update.Set(e => e.ReporterName, reporterName), cancellationToken: cancellationToken);
        return result.MatchedCount == 1;
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken cancellationToken)
    {
        var result = await _events.DeleteOneAsync(e => e.Id == id, cancellationToken);
        return result.DeletedCount == 1;
    }

    // Storage shape, kept separate from the domain record: enums as strings, time as a BSON UTC date.
    // Extra elements are ignored so slice-1 documents (single "Food" field) still read, with no foods;
    // documents from before SawKing read as seen. Coordinates are copied from a GeoPoint and rebuilt into one on read.
    [BsonIgnoreExtraElements]
    private sealed class KingEventDocument
    {
        [BsonId]
        public required string Id { get; init; }
        public required string Kind { get; init; }
        public required DateTime OccurredAtUtc { get; init; }
        public required string ReporterKey { get; init; }
        public string? ReporterName { get; init; }
        public string[] Foods { get; init; } = [];
        public bool SawKing { get; init; } = true;
        public string? SpotId { get; init; }
        public double? Latitude { get; init; }
        public double? Longitude { get; init; }

        public static KingEventDocument From(KingEvent e) => new()
        {
            Id = e.Id,
            Kind = e.Kind.ToString(),
            OccurredAtUtc = e.OccurredAt.UtcDateTime,
            ReporterKey = e.ReporterKey,
            ReporterName = e.ReporterName,
            Foods = [.. e.Foods.Select(f => f.ToString())],
            SawKing = e.SawKing,
            SpotId = e.SpotId,
            Latitude = e.Location?.Latitude,
            Longitude = e.Location?.Longitude,
        };

        public KingEvent ToEvent() => new(
            Id,
            Enum.Parse<KingEventKind>(Kind),
            new DateTimeOffset(DateTime.SpecifyKind(OccurredAtUtc, DateTimeKind.Utc)),
            ReporterKey,
            ReporterName,
            [.. Foods.Select(Enum.Parse<Food>)],
            SawKing,
            SpotId,
            Latitude is { } latitude && Longitude is { } longitude ? new GeoPoint(latitude, longitude) : null);
    }
}
