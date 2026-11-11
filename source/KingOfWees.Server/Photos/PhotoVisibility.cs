using System.Collections.Concurrent;

namespace KingOfWees.Server.Photos;

/// <summary>
/// Remembers, for a minute, that a photo was visible, so the fifty thumbnails that follow a page's listing cost no Mongo
/// reads: every public read that shows photos remembers what it showed (the photos page, one photo, status, history's
/// entries), and the files ask the store only for a photo nobody showed within the minute. Only visibility is
/// remembered, never its absence (a photo shown again is found on its next request), and every admin hide forgets
/// everything, so on this replica a hidden photo's files stop at once; the minute bounds anything else. Why →
/// docs/patterns/photos.md.
/// </summary>
public sealed class PhotoVisibility(TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(1);

    // One entry per photo ever served since the last hide: bounded by the photos there are.
    private readonly ConcurrentDictionary<string, DateTimeOffset> _visibleUntil = new();

    public bool IsRemembered(string id) => _visibleUntil.TryGetValue(id, out var until) && clock.GetUtcNow() < until;

    public void Remember(string id) => _visibleUntil[id] = clock.GetUtcNow() + Lifetime;

    /// <summary>What a public read just showed — never an admin's list of hidden photos.</summary>
    public void Remember(IEnumerable<Photo> photos)
    {
        var until = clock.GetUtcNow() + Lifetime;
        foreach (var photo in photos) _visibleUntil[photo.Id] = until;
    }

    public void Forget() => _visibleUntil.Clear();
}
