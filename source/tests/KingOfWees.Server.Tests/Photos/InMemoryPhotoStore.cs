using System.Collections.Concurrent;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

// Test double for API tests; held to the same PhotoStoreContract as the Mongo store.
public sealed class InMemoryPhotoStore : IPhotoStore
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

    public async Task<Photo?> FindVisibleAsync(HiddenSets hidden, string id, CancellationToken cancellationToken) =>
        (await Visible(hidden, cancellationToken)).FirstOrDefault(p => p.Id == id);

    // Ordinal, like Mongo's string comparison.
    public async Task<IReadOnlyList<Photo>> GetPageAsync(HiddenSets hidden, Photo? before, int count, CancellationToken cancellationToken) =>
    [
        .. (await Visible(hidden, cancellationToken))
            .Where(p => before is null || p.PostedAt < before.PostedAt
                || (p.PostedAt == before.PostedAt && string.CompareOrdinal(p.Id, before.Id) < 0))
            .OrderByDescending(p => p.PostedAt)
            .ThenByDescending(p => p.Id, StringComparer.Ordinal)
            .Take(count),
    ];

    /// <summary>How many times photos were looked up for entries: a request asks once per entry at most (EventViewer).</summary>
    public int ForEventsCalls { get; private set; }

    public async Task<IReadOnlyList<Photo>> ForEventsAsync(HiddenSets hidden, IReadOnlyCollection<string> eventIds, CancellationToken cancellationToken)
    {
        ForEventsCalls++;
        return [.. (await Visible(hidden, cancellationToken)).Where(p => p.EventId is { } id && eventIds.Contains(id))];
    }

    public Task<bool> HideAsync(string id, PhotoHiding hiding, CancellationToken cancellationToken)
    {
        if (!_photos.TryGetValue(id, out var photo)) return Task.FromResult(false);
        _photos[id] = photo with { Hiding = hiding };
        _hiddenIds[id] = true;
        return Task.FromResult(true);
    }

    public Task<bool> ShowAsync(string id, CancellationToken cancellationToken)
    {
        if (!_photos.TryGetValue(id, out var photo)) return Task.FromResult(false);
        _photos[id] = photo with { Hiding = null };
        _hiddenIds.TryRemove(id, out _);
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
    private async Task<IEnumerable<Photo>> Visible(HiddenSets hidden, CancellationToken cancellationToken)
    {
        var hiddenKeys = await hidden.DevicesAsync(cancellationToken);
        var hiddenEntries = await hidden.EntriesAsync(cancellationToken);
        return _photos.Values.Where(p => !_hiddenIds.ContainsKey(p.Id)
            && !hiddenKeys.Contains(p.ReporterKey)
            && (p.EventId is null || !hiddenEntries.Contains(p.EventId)));
    }
}
