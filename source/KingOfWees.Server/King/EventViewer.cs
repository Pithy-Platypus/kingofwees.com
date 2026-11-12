using KingOfWees.Server.Photos;

namespace KingOfWees.Server.King;

/// <summary>
/// How entries are shown to a visitor: with their spot's name and place, and their photo while visible. Scoped: it
/// carries the request's <see cref="HiddenSets"/>, so a handler shows entries through one parameter. (That also keeps
/// the photo upload within the ten arguments an endpoint filter context holds; an eleventh beside a form fails at the
/// first request.)
/// </summary>
public sealed class EventViewer(HiddenSets hidden, ISpotStore spots, IPhotoStore photos, PhotoVisibility visibility)
{
    // Per request (scoped): the spot list once, and each entry's photo asked for once — a status read views the recent
    // page, then the newest photo's entry, and the second call costs nothing it already knows.
    private Task<Dictionary<string, Spot>>? _spotsById;
    private readonly HashSet<string> _asked = [];
    private readonly Dictionary<string, string> _photoIdByEvent = [];

    // A street has a handful of spots; one read beats a lookup per event. Photos: one read for the events not yet
    // asked about, each remembered visible for the thumbnails that follow.
    public async Task<Func<KingEvent, EventView>> ViewsAsync(IReadOnlyCollection<KingEvent> events, CancellationToken cancellationToken)
    {
        var spotsById = await (_spotsById ??= SpotsByIdAsync(cancellationToken));
        var unasked = events.Select(e => e.Id).Where(_asked.Add).ToList();
        if (unasked.Count > 0)
        {
            var shown = await photos.ForEventsAsync(hidden, unasked, cancellationToken);
            visibility.Remember(shown);
            foreach (var photo in shown) _photoIdByEvent[photo.EventId!] = photo.Id;
        }
        return e => EventView.From(e, e.SpotId is null ? null : spotsById.GetValueOrDefault(e.SpotId), _photoIdByEvent.GetValueOrDefault(e.Id));
    }

    private async Task<Dictionary<string, Spot>> SpotsByIdAsync(CancellationToken cancellationToken) =>
        (await spots.ListAsync(hidden, cancellationToken)).ToDictionary(s => s.Id);
}
