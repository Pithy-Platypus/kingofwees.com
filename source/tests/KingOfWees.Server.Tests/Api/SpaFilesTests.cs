using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Hosting;

namespace KingOfWees.Server.Tests.Api;

// The built SPA: content-hashed /assets/ files sent pre-compressed (brotli or gzip, written by the frontend build) and
// cached for good; pages rechecked on every visit, so a deploy shows at once.
public sealed class SpaFilesTests : IAsyncLifetime
{
    private static readonly byte[] Script = Encoding.UTF8.GetBytes("console.log('King');");
    private static readonly byte[] Brotli = [0xB1, 0x0B, 0x01];
    private static readonly byte[] Gzip = [0x1F, 0x8B, 0x08];
    private static readonly byte[] Font = [0x77, 0x4F, 0x46, 0x32];

    private readonly string _webRoot = Directory.CreateTempSubdirectory("kingofwees-webroot-").FullName;
    private KingApiFactory _factory = null!;
    private HttpClient _client = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        var assets = Directory.CreateDirectory(Path.Combine(_webRoot, "assets")).FullName;
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), "<!doctype html><title>King of Wees</title>");
        File.WriteAllBytes(Path.Combine(assets, "index-abc.js"), Script);
        File.WriteAllBytes(Path.Combine(assets, "index-abc.js.br"), Brotli);
        File.WriteAllBytes(Path.Combine(assets, "index-abc.js.gz"), Gzip);
        File.WriteAllBytes(Path.Combine(assets, "font-abc.woff2"), Font);
        _factory = new KingApiFactory();
        // The client sends Accept-Encoding as each test sets it and never decompresses, so the bytes are what was sent.
        _client = _factory.WithWebHostBuilder(b => b.UseWebRoot(_webRoot)).CreateClient();
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        Directory.Delete(_webRoot, recursive: true);
    }

    private async Task<HttpResponseMessage> Get(string path, string? acceptEncoding = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (acceptEncoding is not null) request.Headers.TryAddWithoutValidation("Accept-Encoding", acceptEncoding);
        return await _client.SendAsync(request, Ct);
    }

    [Theory]
    [InlineData("gzip, deflate, br, zstd", "br")]
    [InlineData("br", "br")]
    [InlineData("gzip", "gzip")]
    [InlineData("br;q=0, gzip", "gzip")]
    [InlineData("gzip;q=0.5, br;q=1", "br")]
    [InlineData("*", "br")]
    public async Task A_script_is_sent_in_the_compression_the_browser_accepts(string acceptEncoding, string encoding)
    {
        var response = await Get("/assets/index-abc.js", acceptEncoding);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal([encoding], response.Content.Headers.ContentEncoding);
        Assert.Equal(encoding == "br" ? Brotli : Gzip, await response.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal("text/javascript", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("identity")]
    [InlineData("br;q=0, gzip;q=0")]
    public async Task A_browser_that_accepts_neither_gets_the_plain_file(string? acceptEncoding)
    {
        var response = await Get("/assets/index-abc.js", acceptEncoding);

        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Equal(Script, await response.Content.ReadAsByteArrayAsync(Ct));
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
    }

    [Fact]
    public async Task A_file_with_no_compressed_copy_is_sent_as_it_is()
    {
        var response = await Get("/assets/font-abc.woff2", "br, gzip");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Equal(Font, await response.Content.ReadAsByteArrayAsync(Ct));
    }

    [Theory]
    [InlineData("/assets/index-abc.js", "br")]
    [InlineData("/assets/index-abc.js", null)]
    [InlineData("/assets/font-abc.woff2", "br")]
    public async Task Assets_are_cached_for_a_year_and_never_rechecked(string path, string? acceptEncoding)
    {
        var cache = (await Get(path, acceptEncoding)).Headers.CacheControl;

        Assert.True(cache?.Public);
        Assert.Equal(TimeSpan.FromDays(365), cache?.MaxAge);
        Assert.Contains(cache!.Extensions, e => e.Name == "immutable");
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    [InlineData("/about")]
    public async Task Pages_are_rechecked_on_every_visit_so_a_deploy_shows_at_once(string path)
    {
        var response = await Get(path);

        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.CacheControl?.NoCache);
        Assert.Null(response.Headers.CacheControl?.MaxAge);
    }

    [Fact]
    public async Task A_missing_asset_is_404_not_the_page()
    {
        // A page loaded before a deploy can ask for a script that's gone; HTML in its place fails confusingly.
        var response = await Get("/assets/index-gone.js", "br");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }
}
