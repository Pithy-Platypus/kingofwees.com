namespace KingOfWees.Server.King;

// What an admin sees about a device before hiding it or in the hidden list: never the key itself.
public sealed record ReporterSummary(int Entries, DateTimeOffset? NewestAt, string? LatestName);

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

    /// <summary>
    /// Hides one entry from every public read (admin, spam), or shows it again. Every read here except
    /// <see cref="FindAsync"/> also leaves out entries from devices hidden in <see cref="IHiddenReporterStore"/>.
    /// </summary>
    /// <returns>True when the event exists.</returns>
    Task<bool> SetHiddenAsync(string id, bool hidden, CancellationToken cancellationToken);

    /// <summary>Entries hidden one by one (admin), newest first, whatever their device.</summary>
    Task<IReadOnlyList<KingEvent>> GetHiddenEntriesAsync(CancellationToken cancellationToken);

    /// <summary>Every entry from one device, hidden or not (admin).</summary>
    Task<ReporterSummary> SummarizeReporterAsync(string reporterKey, CancellationToken cancellationToken);

    /// <returns>True when the event exists (and now carries <paramref name="reporterName"/>; null = no name).</returns>
    Task<bool> RenameAsync(string id, string? reporterName, CancellationToken cancellationToken);

    /// <returns>True when an event was deleted.</returns>
    Task<bool> DeleteAsync(string id, CancellationToken cancellationToken);
}
