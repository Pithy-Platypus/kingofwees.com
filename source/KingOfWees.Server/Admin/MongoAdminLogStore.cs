using KingOfWees.Server.King;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace KingOfWees.Server.Admin;

public sealed class MongoAdminLogStore(IMongoDatabase database) : IAdminLogStore
{
    public static readonly TimeSpan KeptFor = TimeSpan.FromDays(365);

    private readonly IMongoCollection<AdminLogDocument> _log = database.GetCollection<AdminLogDocument>("adminLog");
    private volatile bool _expiryIndexed;

    public async Task AppendAsync(AdminLogRecord record, CancellationToken cancellationToken)
    {
        await EnsureExpiryIndexAsync(cancellationToken);
        await _log.InsertOneAsync(AdminLogDocument.From(record), cancellationToken: cancellationToken);
    }

    public async Task<AdminLogRecord?> FindAsync(string id, CancellationToken cancellationToken)
    {
        var document = await _log.Find(r => r.Id == id).FirstOrDefaultAsync(cancellationToken);
        return document?.ToRecord();
    }

    public async Task<IReadOnlyList<AdminLogRecord>> GetPageAsync(AdminLogRecord? before, int count, CancellationToken cancellationToken)
    {
        var filter = Builders<AdminLogDocument>.Filter;
        var olderThanBefore = before is null
            ? filter.Empty
            : filter.Lt(r => r.AtUtc, before.At.UtcDateTime)
              | (filter.Eq(r => r.AtUtc, before.At.UtcDateTime) & filter.Lt(r => r.Id, before.Id));
        var documents = await _log.Find(olderThanBefore)
            .SortByDescending(r => r.AtUtc)
            .ThenByDescending(r => r.Id)
            .Limit(count)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToRecord());
    }

    // The database deletes each record a year after AtUtc. Creating an existing index is a no-op, so a race between
    // two first appends is harmless; done on first write rather than at startup so the app still starts with the
    // database down.
    private async Task EnsureExpiryIndexAsync(CancellationToken cancellationToken)
    {
        if (_expiryIndexed) return;
        await _log.Indexes.CreateOneAsync(
            new CreateIndexModel<AdminLogDocument>(
                Builders<AdminLogDocument>.IndexKeys.Ascending(r => r.AtUtc),
                new CreateIndexOptions { ExpireAfter = KeptFor }),
            cancellationToken: cancellationToken);
        _expiryIndexed = true;
    }

    // Time as a BSON UTC date: a TTL index silently skips documents whose field holds any other type.
    [BsonIgnoreExtraElements]
    private sealed class AdminLogDocument
    {
        [BsonId]
        public required string Id { get; init; }
        public required DateTime AtUtc { get; init; }
        public required string Action { get; init; }
        public string? AdminName { get; init; }
        public string? Address { get; init; }
        public string? PosterName { get; init; }
        public int? Entries { get; init; }
        public int? Spots { get; init; }
        public string? EntryKind { get; init; }
        public DateTime? EntryAtUtc { get; init; }
        public string? PlaceName { get; init; }
        public string? NewName { get; init; }
        public string[]? MergedNames { get; init; }
        public int? Feedings { get; init; }

        public static AdminLogDocument From(AdminLogRecord r) => new()
        {
            Id = r.Id,
            AtUtc = r.At.UtcDateTime,
            Action = r.Action.ToString(),
            AdminName = r.AdminName,
            Address = r.Address,
            PosterName = r.Touched.PosterName,
            Entries = r.Touched.Entries,
            Spots = r.Touched.Spots,
            EntryKind = r.Touched.EntryKind?.ToString(),
            EntryAtUtc = r.Touched.EntryAt?.UtcDateTime,
            PlaceName = r.Touched.PlaceName,
            NewName = r.Touched.NewName,
            MergedNames = r.Touched.MergedNames?.ToArray(),
            Feedings = r.Touched.Feedings,
        };

        public AdminLogRecord ToRecord() => new(
            Id,
            Utc(AtUtc),
            Enum.Parse<AdminAction>(Action),
            AdminName,
            Address,
            new AdminTouched(
                PosterName,
                Entries,
                Spots,
                EntryKind is null ? null : Enum.Parse<KingEventKind>(EntryKind),
                EntryAtUtc is { } entryAt ? Utc(entryAt) : null,
                PlaceName,
                NewName,
                MergedNames,
                Feedings));

        private static DateTimeOffset Utc(DateTime time) => new(DateTime.SpecifyKind(time, DateTimeKind.Utc));
    }
}
