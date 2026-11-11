using System.Collections.Concurrent;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

public sealed class InMemoryPhotoBlobStore : IPhotoBlobStore
{
    private readonly ConcurrentDictionary<string, Stored> _files = new();
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
        // A new tag and time for every put, same bytes or not, as Blob Storage gives; whole seconds, as HTTP dates are.
        var now = DateTimeOffset.UtcNow;
        _files[name] = new Stored(copy.ToArray(), $"\"{Guid.NewGuid():N}\"", now.AddTicks(-(now.Ticks % TimeSpan.TicksPerSecond)));
    }

    public Task<PhotoFile?> OpenAsync(string name, CancellationToken cancellationToken) =>
        Task.FromResult(_files.TryGetValue(name, out var file)
            ? new PhotoFile(new MemoryStream(file.Bytes, writable: false), file.ETag, file.LastModified)
            : null);

    public Task<bool> DeleteAsync(string name, CancellationToken cancellationToken) =>
        Task.FromResult(_files.TryRemove(name, out _));

    private sealed record Stored(byte[] Bytes, string ETag, DateTimeOffset LastModified);
}
