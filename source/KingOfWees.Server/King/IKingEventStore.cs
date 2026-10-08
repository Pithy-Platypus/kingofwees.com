namespace KingOfWees.Server.King;

// The portability seam: Mongo today, anything with the same contract tomorrow.
public interface IKingEventStore
{
    Task AddAsync(KingEvent kingEvent, CancellationToken cancellationToken);

    Task<KingEvent?> FindAsync(string id, CancellationToken cancellationToken);

    Task<KingEvent?> GetLatestAsync(KingEventKind kind, CancellationToken cancellationToken);

    /// <summary>The newest event in which someone saw King: a sighting, or a feeding where the food wasn't just left out.</summary>
    Task<KingEvent?> GetLatestSightingAsync(CancellationToken cancellationToken);

    /// <summary>Newest first.</summary>
    Task<IReadOnlyList<KingEvent>> GetRecentAsync(int count, CancellationToken cancellationToken);

    /// <returns>True when an event was deleted.</returns>
    Task<bool> DeleteAsync(string id, CancellationToken cancellationToken);
}
