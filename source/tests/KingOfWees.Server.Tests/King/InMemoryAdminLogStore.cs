using System.Collections.Concurrent;
using KingOfWees.Server.Admin;

namespace KingOfWees.Server.Tests.King;

// Test double for API tests; held to the same AdminLogStoreContract as the Mongo store (expiry is Mongo's job).
public sealed class InMemoryAdminLogStore : IAdminLogStore
{
    private readonly ConcurrentDictionary<string, AdminLogRecord> _records = new();

    public Task AppendAsync(AdminLogRecord record, CancellationToken cancellationToken)
    {
        _records[record.Id] = record;
        return Task.CompletedTask;
    }

    public Task<AdminLogRecord?> FindAsync(string id, CancellationToken cancellationToken) =>
        Task.FromResult(_records.GetValueOrDefault(id));

    // Ordinal on the id, like Mongo's string comparison.
    public Task<IReadOnlyList<AdminLogRecord>> GetPageAsync(AdminLogRecord? before, int count, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<AdminLogRecord>>(
        [
            .. _records.Values
                .Where(r => before is null || r.At < before.At
                    || (r.At == before.At && string.CompareOrdinal(r.Id, before.Id) < 0))
                .OrderByDescending(r => r.At)
                .ThenByDescending(r => r.Id, StringComparer.Ordinal)
                .Take(count),
        ]);
}
