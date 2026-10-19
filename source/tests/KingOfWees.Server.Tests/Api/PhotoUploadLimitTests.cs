using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.Photos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace KingOfWees.Server.Tests.Api;

// Uploads are read into memory on a 0.5 GiB app, so only a few may run at once, across every visitor; the rest of the
// site goes on meanwhile. Each test holds uploads in the middle of storing their files: the limit covers the whole request.
// (Holding the request body open doesn't work here: the test server hands a request to the app only once it's all sent.)
public sealed class PhotoUploadLimitTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Every file waits to be stored until Release; Holding says how many uploads are waiting.
    private sealed class HeldFiles(IPhotoBlobStore files) : IPhotoBlobStore
    {
        private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _waiting;

        public void Release() => _release.TrySetResult();

        public async Task Holding(int uploads)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            while (Volatile.Read(ref _waiting) < uploads) await Task.Delay(10, timeout.Token);
        }

        public async Task PutAsync(string name, Stream content, CancellationToken cancellationToken)
        {
            if (!_release.Task.IsCompleted) Interlocked.Increment(ref _waiting);
            await _release.Task.WaitAsync(cancellationToken);
            await files.PutAsync(name, content, cancellationToken);
        }

        public Task<Stream?> OpenAsync(string name, CancellationToken cancellationToken) => files.OpenAsync(name, cancellationToken);

        public Task<bool> DeleteAsync(string name, CancellationToken cancellationToken) => files.DeleteAsync(name, cancellationToken);
    }

    private static (WebApplicationFactory<KingOfWees.Server.King.KingEvent> Factory, HeldFiles Files) Held(KingApiFactory factory)
    {
        var files = new HeldFiles(factory.PhotoFiles);
        return (factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPhotoBlobStore>();
            services.AddSingleton<IPhotoBlobStore>(files);
        })), files);
    }

    private static HttpRequestMessage Share()
    {
        var form = new MultipartFormDataContent();
        foreach (var (name, bytes) in new[] { ("photo", TestJpeg.Make()), ("thumbnail", TestJpeg.Make(32)) })
        {
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(file, name, $"{name}.jpg");
        }
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/king/photos") { Content = form };
        request.Headers.Add("X-Reporter-Key", "k");
        return request;
    }

    private static Task<HttpResponseMessage[]> Uploads(HttpClient client, int count) =>
        Task.WhenAll(Enumerable.Range(0, count).Select(_ => client.SendAsync(Share(), Ct)));

    [Fact]
    public async Task Four_uploads_run_at_once_and_a_fifth_gets_429()
    {
        await using var factory = new KingApiFactory();
        var (held, files) = Held(factory);
        var client = held.CreateClient();

        var four = Uploads(client, 4);
        await files.Holding(4);
        var fifth = await client.SendAsync(Share(), Ct);
        files.Release();

        Assert.Equal(HttpStatusCode.TooManyRequests, fifth.StatusCode);
        Assert.All(await four, response => Assert.Equal(HttpStatusCode.Created, response.StatusCode));
    }

    [Fact]
    public async Task The_limit_is_a_setting_and_the_rest_of_the_site_goes_on_while_it_is_reached()
    {
        await using var factory = new KingApiFactory(settings: [("RateLimiting:PhotoUploadsAtOnce", "1")]);
        var (held, files) = Held(factory);
        var client = held.CreateClient();

        var first = Uploads(client, 1);
        await files.Holding(1);
        var second = await client.SendAsync(Share(), Ct);
        var read = await client.GetAsync("/api/king/status", Ct);
        var write = await client.PostAsJsonAsync("/api/king/sightings", new { reporterKey = "k" }, Ct);
        files.Release();

        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        Assert.Equal(HttpStatusCode.Created, write.StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await first).Single().StatusCode);
        // Its place is free again once it's done.
        Assert.Equal(HttpStatusCode.Created, (await client.SendAsync(Share(), Ct)).StatusCode);
    }
}
