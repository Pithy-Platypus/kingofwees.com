using System.Net;
using KingOfWees.Server.Photos;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace KingOfWees.Server.Tests.Api;

// A new revision's first photo-storage call gets the app's token and a connection (seconds), so it's made at startup,
// before the server takes requests. A storage outage mustn't stop the site starting (docs/patterns/photos.md).
public sealed class PhotoStorageWarmUpTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Photo_storage_is_warmed_once_at_startup()
    {
        await using var factory = new KingApiFactory();

        factory.CreateClient();

        Assert.Equal(1, factory.PhotoFiles.WarmUps);
    }

    [Fact]
    public async Task A_store_that_fails_to_warm_up_does_not_stop_the_site()
    {
        await using var factory = new KingApiFactory().WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IPhotoBlobStore>(new StubbornStore(_ => throw new InvalidOperationException("storage down"))))));

        var response = await factory.CreateClient().GetAsync("/api/version", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_store_that_never_answers_is_given_up_on_after_the_limit()
    {
        var called = new TaskCompletionSource();
        var app = new KingApiFactory();
        await using var factory = app.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IPhotoBlobStore>(new StubbornStore(_ =>
            {
                called.TrySetResult();
                return new TaskCompletionSource().Task; // never finishes, whatever the token says
            })))));

        var starting = Task.Run(() => factory.CreateClient(), Ct);
        await called.Task.WaitAsync(TimeSpan.FromSeconds(30), Ct);
        Assert.False(starting.IsCompleted);
        // Until it gives up: the limit's timers start just after the store is called.
        for (var i = 0; i < 100 && !starting.IsCompleted; i++)
        {
            app.Clock.Advance(PhotoStorageWarmUp.Limit);
            await Task.WhenAny(starting, Task.Delay(50, Ct));
        }

        var client = await starting.WaitAsync(TimeSpan.FromSeconds(5), Ct);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/version", Ct)).StatusCode);
    }

    private sealed class StubbornStore(Func<CancellationToken, Task> warmUp) : IPhotoBlobStore
    {
        public Task WarmUpAsync(CancellationToken cancellationToken) => warmUp(cancellationToken);

        public Task PutAsync(string name, Stream content, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<Stream?> OpenAsync(string name, CancellationToken cancellationToken) => Task.FromResult<Stream?>(null);

        public Task<bool> DeleteAsync(string name, CancellationToken cancellationToken) => Task.FromResult(false);
    }
}
