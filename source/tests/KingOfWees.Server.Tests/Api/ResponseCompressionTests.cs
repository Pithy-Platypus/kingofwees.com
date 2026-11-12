using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.Photos;

namespace KingOfWees.Server.Tests.Api;

// API JSON leaves brotli- or gzip-compressed when the browser asks (live on 2026-11-11 it left plain: a habits answer
// of thousands of entries, a history or photos page). Photo files are already JPEG; the SPA's own files are compressed
// at build time (SpaFiles). Why → docs/patterns/site-size.md.
public sealed class ResponseCompressionTests : IAsyncLifetime
{
    private readonly KingApiFactory _factory = new();
    private HttpClient _client = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        _client = _factory.CreateClient();
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private async Task<HttpResponseMessage> Get(string path, string? acceptEncoding)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (acceptEncoding is not null) request.Headers.AcceptEncoding.ParseAdd(acceptEncoding);
        return await _client.SendAsync(request, Ct);
    }

    private static async Task<string> Decoded(HttpResponseMessage response)
    {
        var bytes = await response.Content.ReadAsByteArrayAsync(Ct);
        Stream content = new MemoryStream(bytes);
        content = response.Content.Headers.ContentEncoding.SingleOrDefault() switch
        {
            "br" => new BrotliStream(content, CompressionMode.Decompress),
            "gzip" => new GZipStream(content, CompressionMode.Decompress),
            null => content,
            var other => throw new InvalidOperationException(other),
        };
        using var reader = new StreamReader(content, Encoding.UTF8);
        return await reader.ReadToEndAsync(Ct);
    }

    [Theory]
    [InlineData("br, gzip", "br")]
    [InlineData("gzip", "gzip")]
    [InlineData(null, null)]
    public async Task Api_json_is_compressed_the_way_the_browser_asked(string? acceptEncoding, string? encoding)
    {
        await _client.SeeAsync("device-key-1", "Sarah", Ct);

        var response = await Get("/api/king/status", acceptEncoding);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(encoding is null ? [] : [encoding], response.Content.Headers.ContentEncoding);
        // A cache must not hand a brotli body to a browser that can't read it (a plain answer carries no Vary: harmless either way).
        if (encoding is not null) Assert.Contains("Accept-Encoding", response.Headers.Vary);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.Contains("\"lastSeen\":{", await Decoded(response));
    }

    [Fact]
    public async Task A_validation_problem_is_compressed_too()
    {
        var response = await Get("/api/king/history?limit=0", "br");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["br"], response.Content.Headers.ContentEncoding);
        Assert.Contains("limit.outOfRange", await Decoded(response));
    }

    [Fact]
    public async Task Photo_files_are_not_compressed_again()
    {
        var photo = new Photo(Guid.CreateVersion7().ToString(), null, _factory.Clock.GetUtcNow(), "device", "Sarah");
        await _factory.PhotoFiles.PutAsync(PhotoFiles.Thumbnail(photo.Id), new MemoryStream(TestJpeg.Make(50)), Ct);
        await _factory.Photos.AddAsync(photo, Ct);

        var response = await Get($"/api/king/photos/{photo.Id}/thumb", "br, gzip");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Equal(TestJpeg.Make(50), await response.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal(CacheControlHeaderValue.Parse("private, max-age=3600"), response.Headers.CacheControl);
    }
}
