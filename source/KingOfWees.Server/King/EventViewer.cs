using KingOfWees.Server.Photos;

namespace KingOfWees.Server.King;

/// <summary>
/// How entries are shown to a visitor: with their spot's name and place, and their photo while visible. Scoped: it
/// carries the request's <see cref="HiddenSets"/>, so a handler shows entries through one parameter. (That also keeps
/// the photo upload within the ten arguments an endpoint filter context holds; an eleventh beside a form fails at the
/// first request.)
/// </summary>
public sealed class EventViewer(HiddenSets hidden, ISpotStore spots, IPhotoStore photos)
{
    // A street has a handful of spots; one read beats a lookup per event. Photos: one read for the events shown.
    public async Task<Func<KingEvent, EventView>> ViewsAsync(IReadOnlyCollection<KingEvent> events, CancellationToken cancellationToken)
    {
        var spotsById = (await spots.ListAsync(hidden, cancellationToken)).ToDictionary(s => s.Id);
        var photoIds = (await photos.ForEventsAsync(hidden, [.. events.Select(e => e.Id).Distinct()], cancellationToken))
            .ToDictionary(p => p.EventId!, p => p.Id);
        return e => EventView.From(e, e.SpotId is null ? null : spotsById.GetValueOrDefault(e.SpotId), photoIds.GetValueOrDefault(e.Id));
    }
}
