using System.Collections.Concurrent;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same SpotStoreContract as the Mongo store.
public sealed class InMemorySpotStore : ISpotStore
{
    private readonly ConcurrentDictionary<string, Spot> _spots = new();

    public Task AddAsync(Spot spot, CancellationToken cancellationToken)
    {
        _spots[spot.Id] = spot;
        return Task.CompletedTask;
    }

    public Task<Spot?> FindAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_spots.GetValueOrDefault(id));

    public Task<IReadOnlyList<Spot>> ListAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Spot>>([.. _spots.Values.OrderBy(s => s.CreatedAt)]);
}
