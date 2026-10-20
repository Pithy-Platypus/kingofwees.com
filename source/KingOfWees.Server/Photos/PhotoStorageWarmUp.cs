namespace KingOfWees.Server.Photos;

// A new revision's first photo-storage call waits for the app's managed-identity token and a connection (1.9–3.2 s for
// the token alone), and every thumbnail on the first page queues behind it. Made here, before Kestrel takes requests,
// so the readiness probe and the first visitors find it warm. Never fatal: a storage outage mustn't stop the site
// starting, which is also why storage isn't in /health. Why → docs/patterns/photos.md.
public sealed partial class PhotoStorageWarmUp(IPhotoBlobStore files, TimeProvider clock, ILogger<PhotoStorageWarmUp> logger)
    : IHostedService
{
    public static readonly TimeSpan Limit = TimeSpan.FromSeconds(10);

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var limit = new CancellationTokenSource(Limit, clock);
        using var either = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, limit.Token);
        try
        {
            // WaitAsync as well as the token: a call that ignores its token still can't hold startup.
            await files.WarmUpAsync(either.Token).WaitAsync(Limit, clock, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            WarmUpFailed(logger, exception);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Warning, Message = "Photo storage didn't warm up at startup; the first photos will be slow")]
    private static partial void WarmUpFailed(ILogger logger, Exception exception);
}
