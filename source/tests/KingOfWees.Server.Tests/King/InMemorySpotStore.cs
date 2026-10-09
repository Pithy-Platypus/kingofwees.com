using System.Collections.Concurrent;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same SpotStoreContract as the Mongo store.
public sealed class InMemorySpotStore(IHiddenReporterStore hiddenReporters) : ISpotStore
{
    private readonly ConcurrentDictionary<string, Spot> _spots = new();

    public Task AddAsync(Spot spot, CancellationToken cancellationToken)
    {
        _spots[spot.Id] = spot;
        return Task.CompletedTask;
    }

    public Task<Spot?> FindAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_spots.GetValueOrDefault(id));

    public Task<int> CountByReporterAsync(string reporterKey, CancellationToken cancellationToken) =>
        Task.FromResult(_spots.Values.Count(s => s.ReporterKey == reporterKey));

    public async Task<IReadOnlyList<Spot>> ListAsync(CancellationToken cancellationToken)
    {
        var hiddenKeys = (await hiddenReporters.ListAsync(cancellationToken)).Select(h => h.ReporterKey).ToHashSet();
        return [.. _spots.Values.Where(s => !hiddenKeys.Contains(s.ReporterKey)).OrderBy(s => s.CreatedAt)];
    }
}
