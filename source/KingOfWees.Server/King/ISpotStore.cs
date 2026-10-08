namespace KingOfWees.Server.King;

public interface ISpotStore
{
    Task AddAsync(Spot spot, CancellationToken cancellationToken);

    Task<Spot?> FindAsync(string id, CancellationToken cancellationToken);

    /// <summary>Oldest first; the client sorts by name in the reader's language.</summary>
    Task<IReadOnlyList<Spot>> ListAsync(CancellationToken cancellationToken);
}
