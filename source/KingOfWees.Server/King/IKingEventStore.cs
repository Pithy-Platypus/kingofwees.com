namespace KingOfWees.Server.King;

// The portability seam: Mongo today, anything with the same contract tomorrow.
public interface IKingEventStore
{
    Task AddAsync(KingEvent kingEvent, CancellationToken cancellationToken);

    Task<KingEvent?> FindAsync(string id, CancellationToken cancellationToken);

    Task<KingEvent?> GetLatestAsync(KingEventKind kind, CancellationToken cancellationToken);

    /// <summary>The newest event in which someone saw King: a sighting, or a feeding where the food wasn't just left out.</summary>
    Task<KingEvent?> GetLatestSightingAsync(CancellationToken cancellationToken);

    /// <summary>Newest first, by time then id; <paramref name="before"/> (null = from the newest) is the last event of the previous page.</summary>
    Task<IReadOnlyList<KingEvent>> GetPageAsync(KingEvent? before, int count, CancellationToken cancellationToken);

    /// <summary>Events in which King was seen that carry their own location, per block; <paramref name="since"/> null = all time.</summary>
    Task<IReadOnlyList<PlaceCount>> CountSightingsByPlaceAsync(DateTimeOffset? since, CancellationToken cancellationToken);

    /// <summary>Feedings per spot (feedings without one are left out); <paramref name="seenOnly"/> skips those where food was left out.</summary>
    Task<IReadOnlyList<SpotCount>> CountFeedingsBySpotAsync(DateTimeOffset? since, bool seenOnly, CancellationToken cancellationToken);

    /// <returns>True when the event exists (and now carries <paramref name="reporterName"/>; null = no name).</returns>
    Task<bool> RenameAsync(string id, string? reporterName, CancellationToken cancellationToken);

    /// <returns>True when an event was deleted.</returns>
    Task<bool> DeleteAsync(string id, CancellationToken cancellationToken);
}
