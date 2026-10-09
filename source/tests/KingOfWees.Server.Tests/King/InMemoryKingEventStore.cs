using System.Collections.Concurrent;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same KingEventStoreContract as the Mongo store.
public sealed class InMemoryKingEventStore(IHiddenReporterStore hiddenReporters) : IKingEventStore
{
    private readonly ConcurrentDictionary<string, KingEvent> _events = new();
    private readonly ConcurrentDictionary<string, bool> _hiddenIds = new();

    public Task AddAsync(KingEvent kingEvent, CancellationToken cancellationToken)
    {
        _events[kingEvent.Id] = kingEvent;
        return Task.CompletedTask;
    }

    public Task<KingEvent?> FindAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_events.GetValueOrDefault(id));

    public Task<KingEvent?> GetLatestAsync(KingEventKind kind, CancellationToken cancellationToken) =>
        Task.FromResult(Visible().Where(e => e.Kind == kind).MaxBy(e => e.OccurredAt));

    public Task<KingEvent?> GetLatestSightingAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Visible().Where(e => e.SawKing).MaxBy(e => e.OccurredAt));

    // Ordinal, like Mongo's string comparison.
    public Task<IReadOnlyList<KingEvent>> GetPageAsync(KingEvent? before, int count, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<KingEvent>>(
        [
            .. Visible()
                .Where(e => before is null || e.OccurredAt < before.OccurredAt
                    || (e.OccurredAt == before.OccurredAt && string.CompareOrdinal(e.Id, before.Id) < 0))
                .OrderByDescending(e => e.OccurredAt)
                .ThenByDescending(e => e.Id, StringComparer.Ordinal)
                .Take(count),
        ]);

    public Task<IReadOnlyList<PlaceCount>> CountSightingsByPlaceAsync(DateTimeOffset? since, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<PlaceCount>>(
        [
            .. Since(since)
                .Where(e => e.SawKing && e.Location is not null)
                .GroupBy(e => e.Location!)
                .Select(g => new PlaceCount(g.Key, g.Count())),
        ]);

    public Task<IReadOnlyList<SpotCount>> CountFeedingsBySpotAsync(DateTimeOffset? since, bool seenOnly, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<SpotCount>>(
        [
            .. Since(since)
                .Where(e => e.SpotId is not null && (!seenOnly || e.SawKing))
                .GroupBy(e => e.SpotId!)
                .Select(g => new SpotCount(g.Key, g.Count())),
        ]);

    private IEnumerable<KingEvent> Since(DateTimeOffset? since) => Visible().Where(e => since is null || e.OccurredAt >= since);

    // What a visitor may see: not hidden, and not from a hidden device.
    private IEnumerable<KingEvent> Visible()
    {
        var hiddenKeys = hiddenReporters.ListAsync(CancellationToken.None).Result.Select(h => h.ReporterKey).ToHashSet();
        return _events.Values.Where(e => !_hiddenIds.ContainsKey(e.Id) && !hiddenKeys.Contains(e.ReporterKey));
    }

    public Task<IReadOnlyList<KingEvent>> GetHiddenEntriesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<KingEvent>>(
        [
            .. _events.Values
                .Where(e => _hiddenIds.ContainsKey(e.Id))
                .OrderByDescending(e => e.OccurredAt)
                .ThenByDescending(e => e.Id, StringComparer.Ordinal),
        ]);

    public Task<ReporterSummary> SummarizeReporterAsync(string reporterKey, CancellationToken cancellationToken)
    {
        var fromDevice = _events.Values.Where(e => e.ReporterKey == reporterKey).ToList();
        var newest = fromDevice.MaxBy(e => e.OccurredAt);
        return Task.FromResult(new ReporterSummary(fromDevice.Count, newest?.OccurredAt, newest?.ReporterName));
    }

    public Task<bool> SetHiddenAsync(string id, bool hidden, CancellationToken cancellationToken)
    {
        if (!_events.ContainsKey(id)) return Task.FromResult(false);
        if (hidden) _hiddenIds[id] = true;
        else _hiddenIds.TryRemove(id, out _);
        return Task.FromResult(true);
    }

    public Task<bool> RenameAsync(string id, string? reporterName, CancellationToken cancellationToken)
    {
        if (!_events.TryGetValue(id, out var kingEvent)) return Task.FromResult(false);
        _events[id] = kingEvent with { ReporterName = reporterName };
        return Task.FromResult(true);
    }

    public Task<bool> DeleteAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_events.TryRemove(id, out _));
}
