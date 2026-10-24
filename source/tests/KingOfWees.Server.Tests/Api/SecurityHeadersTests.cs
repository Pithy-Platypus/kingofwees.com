using System.Net;
using System.Net.Http.Headers;
using KingOfWees.Server.Admin;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.Photos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.Tests.Api;

// Every response tells the browser what the page may load and where it may be framed: the admin key lives in
// localStorage, so a script the page didn't ship must never run. Why → docs/patterns/security-headers.md.
public sealed class SecurityHeadersTests : IAsyncLifetime
{
    private const string Policy =
        "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; font-src 'self' data:; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    private readonly string _webRoot = Directory.CreateTempSubdirectory("kingofwees-webroot-").FullName;
    private KingApiFactory _factory = null!;
    private HttpClient _client = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), "<!doctype html><title>King of Wees</title>");
        _factory = new KingApiFactory();
        _client = _factory.WithWebHostBuilder(b => b.UseWebRoot(_webRoot)).CreateClient();
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        Directory.Delete(_webRoot, recursive: true);
    }

    [Theory]
    [InlineData("/", HttpStatusCode.OK)]
    [InlineData("/about", HttpStatusCode.OK)]
    [InlineData("/api/king/status", HttpStatusCode.OK)]
    [InlineData("/api/king/nothing-here", HttpStatusCode.NotFound)]
    public async Task Every_response_carries_the_security_headers(string path, HttpStatusCode status)
    {
        var response = await _client.GetAsync(path, Ct);

        Assert.Equal(status, response.StatusCode);
        Assert.Equal(Policy, Single(response, "Content-Security-Policy"));
        Assert.Equal("max-age=31536000", Single(response, "Strict-Transport-Security"));
        Assert.Equal("nosniff", Single(response, "X-Content-Type-Options"));
        // OpenStreetMap's tile policy requires a Referer naming the site; never no-referrer.
        Assert.Equal("strict-origin-when-cross-origin", Single(response, "Referrer-Policy"));
        // No other site may load the site's files (King's photos in its <img>, say); the site's own pages still do.
        Assert.Equal("same-origin", Single(response, "Cross-Origin-Resource-Policy"));
        // Kept out of search engines (Wallie, 2026-10-20); robots.txt lets crawlers in so they can read this.
        Assert.Equal("noindex", Single(response, "X-Robots-Tag"));
    }

    [Theory]
    [InlineData("/", "no-cache")]
    [InlineData("/api/king/status", "no-store")]
    [InlineData("/api/king/nothing-here", "no-store")]
    [InlineData("/api/version", "no-store")]
    public async Task Api_answers_are_never_cached_while_pages_ask_again(string path, string cacheControl)
    {
        // An API answer is for this moment and this visitor; a shared browser must not replay one from its cache.
        var response = await _client.GetAsync(path, Ct);

        Assert.Equal(cacheControl, Single(response, "Cache-Control"));
    }

    [Fact]
    public async Task Admin_answers_are_never_cached()
    {
        // After "Sign out on this device" the activity log (addresses, typed names) must not come back from the cache.
        const string key = "test-admin-key";
        await using var factory = new KingApiFactory(settings: [("King:Admin:KeyHash", AdminKeyHasher.Hash(key))]);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);

        var response = await client.GetAsync("/api/admin/activity", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", Single(response, "Cache-Control"));
    }

    [Fact]
    public async Task Photo_files_keep_their_own_short_private_caching()
    {
        // The one API answer that may be cached: an hour, for this visitor only (docs/patterns/photos.md).
        var photo = new Photo(Guid.CreateVersion7().ToString(), null, _factory.Clock.GetUtcNow(), "device", "Sarah");
        await _factory.PhotoFiles.PutAsync(PhotoFiles.Thumbnail(photo.Id), new MemoryStream(TestJpeg.Make(50)), Ct);
        await _factory.Photos.AddAsync(photo, Ct);

        var response = await _client.GetAsync($"/api/king/photos/{photo.Id}/thumb", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Parsed: HttpClient reorders the directives.
        Assert.Equal(CacheControlHeaderValue.Parse("private, max-age=3600"), response.Headers.CacheControl);
    }

    [Fact]
    public void Kestrel_caps_request_bodies_and_does_not_name_itself()
    {
        // The test server enforces neither, so check the configuration; photo uploads raise the cap for themselves
        // (PhotoApiTests). Checked by hand against Kestrel: a 100 kB sighting → 413, a 194 kB photo upload past the cap (docs/patterns/request-limits.md).
        var kestrel = _factory.Services.GetRequiredService<IOptions<KestrelServerOptions>>().Value;

        Assert.Equal(64 * 1024, kestrel.Limits.MaxRequestBodySize);
        Assert.False(kestrel.AddServerHeader);
    }

    private static string Single(HttpResponseMessage response, string header) =>
        Assert.Single(response.Headers.TryGetValues(header, out var values)
            ? values
            : response.Content.Headers.TryGetValues(header, out var content) ? content : []);
}
