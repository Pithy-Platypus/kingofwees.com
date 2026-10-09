namespace KingOfWees.Server.King;

public interface ISpotStore
{
    Task AddAsync(Spot spot, CancellationToken cancellationToken);

    Task<Spot?> FindAsync(string id, CancellationToken cancellationToken);

    /// <summary>Spots one device added, hidden or not (admin).</summary>
    Task<int> CountByReporterAsync(string reporterKey, CancellationToken cancellationToken);

    /// <summary>Oldest first, leaving out spots from hidden devices; the client sorts by name in the reader's language.</summary>
    Task<IReadOnlyList<Spot>> ListAsync(CancellationToken cancellationToken);
}
