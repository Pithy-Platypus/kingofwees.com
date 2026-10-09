using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace KingOfWees.Server.King;

public sealed class MongoHiddenReporterStore(IMongoDatabase database) : IHiddenReporterStore
{
    private readonly IMongoCollection<HiddenReporterDocument> _hidden =
        database.GetCollection<HiddenReporterDocument>("hiddenReporters");

    // Upsert on the key, setting fields only on insert, so hiding twice keeps the first record.
    public async Task<HiddenReporter> HideAsync(string reporterKey, DateTimeOffset hiddenAt, CancellationToken cancellationToken)
    {
        var document = await _hidden.FindOneAndUpdateAsync(
            Builders<HiddenReporterDocument>.Filter.Eq(h => h.ReporterKey, reporterKey),
            Builders<HiddenReporterDocument>.Update
                .SetOnInsert(h => h.Id, Guid.CreateVersion7(hiddenAt).ToString())
                .SetOnInsert(h => h.HiddenAtUtc, hiddenAt.UtcDateTime),
            new FindOneAndUpdateOptions<HiddenReporterDocument> { IsUpsert = true, ReturnDocument = ReturnDocument.After },
            cancellationToken);
        return document.ToHiddenReporter();
    }

    public async Task<bool> RestoreAsync(string id, CancellationToken cancellationToken)
    {
        var result = await _hidden.DeleteOneAsync(h => h.Id == id, cancellationToken);
        return result.DeletedCount == 1;
    }

    public async Task<IReadOnlyList<HiddenReporter>> ListAsync(CancellationToken cancellationToken)
    {
        var documents = await _hidden.Find(FilterDefinition<HiddenReporterDocument>.Empty)
            .SortByDescending(h => h.HiddenAtUtc)
            .ThenByDescending(h => h.Id)
            .ToListAsync(cancellationToken);
        return documents.ConvertAll(d => d.ToHiddenReporter());
    }

    [BsonIgnoreExtraElements]
    private sealed class HiddenReporterDocument
    {
        [BsonId]
        public required string Id { get; init; }
        public required string ReporterKey { get; init; }
        public required DateTime HiddenAtUtc { get; init; }

        public HiddenReporter ToHiddenReporter() =>
            new(Id, ReporterKey, new DateTimeOffset(DateTime.SpecifyKind(HiddenAtUtc, DateTimeKind.Utc)));
    }
}
