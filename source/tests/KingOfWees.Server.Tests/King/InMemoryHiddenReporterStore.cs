using System.Collections.Concurrent;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same HiddenReporterStoreContract as the Mongo store.
public sealed class InMemoryHiddenReporterStore : IHiddenReporterStore
{
    private readonly ConcurrentDictionary<string, HiddenReporter> _byKey = new();

    public Task<HiddenReporter> HideAsync(string reporterKey, DateTimeOffset hiddenAt, CancellationToken cancellationToken) =>
        Task.FromResult(_byKey.GetOrAdd(reporterKey, key => new HiddenReporter(Guid.CreateVersion7(hiddenAt).ToString(), key, hiddenAt)));

    public Task<bool> RestoreAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_byKey.Values.FirstOrDefault(h => h.Id == id) is { } record && _byKey.TryRemove(record.ReporterKey, out _));

    // Ordinal on the id, like Mongo's string comparison.
    public Task<IReadOnlyList<HiddenReporter>> ListAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<HiddenReporter>>(
            [.. _byKey.Values.OrderByDescending(h => h.HiddenAt).ThenByDescending(h => h.Id, StringComparer.Ordinal)]);
}
