namespace KingOfWees.Server.King;

public interface ISpotStore
{
    Task AddAsync(Spot spot, CancellationToken cancellationToken);

    Task<Spot?> FindAsync(string id, CancellationToken cancellationToken);

    /// <summary>Changes only the name (admin); false when no spot has the id, hidden or not.</summary>
    Task<bool> RenameAsync(string id, string name, CancellationToken cancellationToken);

    /// <summary>
    /// Whether a spot not in <paramref name="exceptIds"/> has this name, ignoring case (admin). Counts hidden devices'
    /// spots too, so restoring a device can't bring back a second place with the same name.
    /// </summary>
    Task<bool> NameTakenAsync(string name, IReadOnlyCollection<string> exceptIds, CancellationToken cancellationToken);

    /// <summary>Deletes these spots for good, hidden or not (admin: merging places); unknown ids are skipped.</summary>
    /// <returns>How many were deleted.</returns>
    Task<int> DeleteAsync(IReadOnlyCollection<string> ids, CancellationToken cancellationToken);

    /// <summary>Spots one device added, hidden or not (admin).</summary>
    Task<int> CountByReporterAsync(string reporterKey, CancellationToken cancellationToken);

    /// <summary>Oldest first, leaving out spots from hidden devices; the client sorts by name in the reader's language.</summary>
    Task<IReadOnlyList<Spot>> ListAsync(CancellationToken cancellationToken);

    /// <summary>Every spot, hidden devices' too, oldest first (admin: renaming any place).</summary>
    Task<IReadOnlyList<Spot>> ListEveryAsync(CancellationToken cancellationToken);
}
