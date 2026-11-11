namespace KingOfWees.Server.King;

/// <summary>
/// What every public read leaves out — the keys of hidden devices and the ids of entries hidden one by one — loaded
/// once per request (scoped) and handed to each read. A device or entry hidden while a request runs leaves the reads
/// of the next request, not this one's.
/// </summary>
public sealed class HiddenSets(IHiddenReporterStore hiddenReporters, IKingEventStore events)
{
    private Task<IReadOnlySet<string>>? _devices;
    private Task<IReadOnlySet<string>>? _entries;

    /// <summary>The keys of hidden devices.</summary>
    public Task<IReadOnlySet<string>> DevicesAsync(CancellationToken cancellationToken) =>
        _devices ??= hiddenReporters.ListKeysAsync(cancellationToken);

    /// <summary>The ids of entries hidden one by one.</summary>
    public Task<IReadOnlySet<string>> EntriesAsync(CancellationToken cancellationToken) =>
        _entries ??= events.GetHiddenEntryIdsAsync(cancellationToken);
}
