using System.Collections.Concurrent;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same KingEventStoreContract as the Mongo store.
public sealed class InMemoryKingEventStore : IKingEventStore
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

    public Task<IReadOnlyList<KingEvent>> FindManyAsync(IReadOnlyCollection<string> ids, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<KingEvent>>([.. ids.Distinct().Select(_events.GetValueOrDefault).OfType<KingEvent>()]);

    public async Task<KingEvent?> GetLatestAsync(HiddenSets hidden, KingEventKind kind, CancellationToken cancellationToken) =>
        (await Visible(hidden, cancellationToken)).Where(e => e.Kind == kind).MaxBy(e => e.OccurredAt);

    public async Task<KingEvent?> GetLatestSightingAsync(HiddenSets hidden, CancellationToken cancellationToken) =>
        (await Visible(hidden, cancellationToken)).Where(e => e.SawKing).MaxBy(e => e.OccurredAt);

    // Ordinal, like Mongo's string comparison.
    public async Task<IReadOnlyList<KingEvent>> GetPageAsync(HiddenSets hidden, KingEvent? before, int count, CancellationToken cancellationToken) =>
    [
        .. (await Visible(hidden, cancellationToken))
            .Where(e => before is null || e.OccurredAt < before.OccurredAt
                || (e.OccurredAt == before.OccurredAt && string.CompareOrdinal(e.Id, before.Id) < 0))
            .OrderByDescending(e => e.OccurredAt)
            .ThenByDescending(e => e.Id, StringComparer.Ordinal)
            .Take(count),
    ];

    public async Task<IReadOnlyList<PlaceCount>> CountSightingsByPlaceAsync(HiddenSets hidden, DateTimeOffset? since, CancellationToken cancellationToken) =>
    [
        .. (await Since(hidden, since, cancellationToken))
            .Where(e => e.SawKing && e.Location is not null)
            .GroupBy(e => e.Location!)
            .Select(g => new PlaceCount(g.Key, g.Count())),
    ];

    public async Task<IReadOnlyList<SpotCount>> CountFeedingsBySpotAsync(
        HiddenSets hidden, DateTimeOffset? since, bool seenOnly, CancellationToken cancellationToken) =>
    [
        .. (await Since(hidden, since, cancellationToken))
            .Where(e => e.SpotId is not null && (!seenOnly || e.SawKing))
            .GroupBy(e => e.SpotId!)
            .Select(g => new SpotCount(g.Key, g.Count())),
    ];

    private async Task<IEnumerable<KingEvent>> Since(HiddenSets hidden, DateTimeOffset? since, CancellationToken cancellationToken) =>
        (await Visible(hidden, cancellationToken)).Where(e => since is null || e.OccurredAt >= since);

    // What a visitor may see: not hidden, and not from a hidden device.
    private async Task<IEnumerable<KingEvent>> Visible(HiddenSets hidden, CancellationToken cancellationToken)
    {
        var hiddenKeys = await hidden.DevicesAsync(cancellationToken);
        var hiddenEntries = await hidden.EntriesAsync(cancellationToken);
        return _events.Values.Where(e => !hiddenEntries.Contains(e.Id) && !hiddenKeys.Contains(e.ReporterKey));
    }

    public Task<IReadOnlyList<KingEvent>> GetHiddenEntriesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<KingEvent>>(
        [
            .. _events.Values
                .Where(e => _hiddenIds.ContainsKey(e.Id))
                .OrderByDescending(e => e.OccurredAt)
                .ThenByDescending(e => e.Id, StringComparer.Ordinal),
        ]);

    public Task<IReadOnlySet<string>> GetHiddenEntryIdsAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlySet<string>>(_hiddenIds.Keys.ToHashSet());

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

    public Task<int> MoveFeedingsAsync(IReadOnlyCollection<string> fromSpotIds, string toSpotId, CancellationToken cancellationToken)
    {
        var moving = _events.Values.Where(e => e.SpotId is not null && fromSpotIds.Contains(e.SpotId)).ToList();
        foreach (var e in moving) _events[e.Id] = e with { SpotId = toSpotId };
        return Task.FromResult(moving.Count);
    }

    public Task<IReadOnlyList<SpotCount>> CountEveryFeedingBySpotAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<SpotCount>>(
            [.. _events.Values.Where(e => e.SpotId is not null).GroupBy(e => e.SpotId!).Select(g => new SpotCount(g.Key, g.Count()))]);
}
