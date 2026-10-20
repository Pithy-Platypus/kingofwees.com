using System.Collections.Concurrent;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

public sealed class InMemoryPhotoBlobStore : IPhotoBlobStore
{
    private readonly ConcurrentDictionary<string, byte[]> _files = new();
    private int _warmUps;

    public int WarmUps => _warmUps;

    public Task WarmUpAsync(CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _warmUps);
        return Task.CompletedTask;
    }

    public async Task PutAsync(string name, Stream content, CancellationToken cancellationToken)
    {
        using var copy = new MemoryStream();
        await content.CopyToAsync(copy, cancellationToken);
        _files[name] = copy.ToArray();
    }

    public Task<Stream?> OpenAsync(string name, CancellationToken cancellationToken) =>
        Task.FromResult<Stream?>(_files.TryGetValue(name, out var bytes) ? new MemoryStream(bytes, writable: false) : null);

    public Task<bool> DeleteAsync(string name, CancellationToken cancellationToken) =>
        Task.FromResult(_files.TryRemove(name, out _));
}
