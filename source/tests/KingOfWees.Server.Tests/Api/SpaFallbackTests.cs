using System.Net;
using Microsoft.AspNetCore.Hosting;

namespace KingOfWees.Server.Tests.Api;

// In production the API serves the built SPA from wwwroot; deep links must reach index.html.
public sealed class SpaFallbackTests : IAsyncLifetime
{
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
    [InlineData("/about")]
    [InlineData("/privacy")]
    public async Task Page_routes_are_served_the_app(string path)
    {
        var response = await _client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("King of Wees", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Unknown_api_routes_stay_404_instead_of_returning_the_app()
    {
        var response = await _client.GetAsync("/api/nope", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }
}
