using System.Collections.Concurrent;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same KingEventStoreContract as the Mongo store.
public sealed class InMemoryKingEventStore : IKingEventStore
{
    private readonly ConcurrentDictionary<string, KingEvent> _events = new();

    public Task AddAsync(KingEvent kingEvent, CancellationToken cancellationToken)
    {
        _events[kingEvent.Id] = kingEvent;
        return Task.CompletedTask;
    }

    public Task<KingEvent?> FindAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_events.GetValueOrDefault(id));

    public Task<KingEvent?> GetLatestAsync(KingEventKind kind, CancellationToken cancellationToken) =>
        Task.FromResult(_events.Values.Where(e => e.Kind == kind).MaxBy(e => e.OccurredAt));

    public Task<KingEvent?> GetLatestSightingAsync(CancellationToken cancellationToken) =>
        Task.FromResult(_events.Values.Where(e => e.SawKing).MaxBy(e => e.OccurredAt));

    public Task<IReadOnlyList<KingEvent>> GetRecentAsync(int count, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<KingEvent>>(
            [.. _events.Values.OrderByDescending(e => e.OccurredAt).Take(count)]);

    public Task<bool> DeleteAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_events.TryRemove(id, out _));
}
