using System.Collections.Concurrent;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

// Test double for API tests; held to the same PhotoStoreContract as the Mongo store.
public sealed class InMemoryPhotoStore(IKingEventStore events, IHiddenReporterStore hiddenReporters) : IPhotoStore
{
    private readonly ConcurrentDictionary<string, Photo> _photos = new();
    private readonly ConcurrentDictionary<string, bool> _hiddenIds = new();

    public Task AddAsync(Photo photo, CancellationToken cancellationToken)
    {
        _photos[photo.Id] = photo;
        return Task.CompletedTask;
    }

    public Task<Photo?> FindAsync(string id, CancellationToken cancellationToken) => Task.FromResult(_photos.GetValueOrDefault(id));

    public Task<Photo?> FindByEventAsync(string eventId, CancellationToken cancellationToken) =>
        Task.FromResult(_photos.Values.FirstOrDefault(p => p.EventId == eventId));

    public Task<Photo?> FindVisibleAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(Visible().FirstOrDefault(p => p.Id == id));

    // Ordinal, like Mongo's string comparison.
    public Task<IReadOnlyList<Photo>> GetPageAsync(Photo? before, int count, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Photo>>(
        [
            .. Visible()
                .Where(p => before is null || p.PostedAt < before.PostedAt
                    || (p.PostedAt == before.PostedAt && string.CompareOrdinal(p.Id, before.Id) < 0))
                .OrderByDescending(p => p.PostedAt)
                .ThenByDescending(p => p.Id, StringComparer.Ordinal)
                .Take(count),
        ]);

    public Task<IReadOnlyList<Photo>> ForEventsAsync(IReadOnlyCollection<string> eventIds, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Photo>>([.. Visible().Where(p => p.EventId is { } id && eventIds.Contains(id))]);

    public Task<bool> SetHiddenAsync(string id, bool hidden, CancellationToken cancellationToken)
    {
        if (!_photos.ContainsKey(id)) return Task.FromResult(false);
        if (hidden) _hiddenIds[id] = true;
        else _hiddenIds.TryRemove(id, out _);
        return Task.FromResult(true);
    }

    public Task<IReadOnlyList<Photo>> GetHiddenAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Photo>>(
        [
            .. _photos.Values
                .Where(p => _hiddenIds.ContainsKey(p.Id))
                .OrderByDescending(p => p.PostedAt)
                .ThenByDescending(p => p.Id, StringComparer.Ordinal),
        ]);

    public Task<bool> DeleteAsync(string id, CancellationToken cancellationToken) => Task.FromResult(_photos.TryRemove(id, out _));

    // What a visitor may see: not hidden, not from a hidden device, not on a hidden entry.
    private IEnumerable<Photo> Visible()
    {
        var hiddenKeys = hiddenReporters.ListAsync(CancellationToken.None).Result.Select(h => h.ReporterKey).ToHashSet();
        var hiddenEntries = events.GetHiddenEntriesAsync(CancellationToken.None).Result.Select(e => e.Id).ToHashSet();
        return _photos.Values.Where(p => !_hiddenIds.ContainsKey(p.Id)
            && !hiddenKeys.Contains(p.ReporterKey)
            && (p.EventId is null || !hiddenEntries.Contains(p.EventId)));
    }
}
