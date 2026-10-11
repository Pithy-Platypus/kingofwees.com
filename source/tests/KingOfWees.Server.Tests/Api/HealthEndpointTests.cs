using System.Net;
using KingOfWees.Server.Tests.King;
using Microsoft.AspNetCore.Hosting;

namespace KingOfWees.Server.Tests.Api;

// Container Apps probes these in production. The built image serves the SPA, so an unmapped /health would be
// answered by index.html with a 200 and the probe would pass with the database down.
public sealed class HealthEndpointTests(MongoAppFixture mongo) : IClassFixture<MongoAppFixture>, IAsyncLifetime
{
    private const string UnreachableMongo = "mongodb://localhost:1/king?serverSelectionTimeoutMS=300";

    private readonly string _webRoot = Directory.CreateTempSubdirectory("kingofwees-webroot-").FullName;
    private readonly List<KingApiFactory> _factories = [];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), "<!doctype html><title>King of Wees</title>");
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var factory in _factories) await factory.DisposeAsync();
        Directory.Delete(_webRoot, recursive: true);
    }

    private HttpClient ProductionClient(string connectionString)
    {
        var factory = new KingApiFactory(settings: [("ConnectionStrings:king", connectionString)]);
        _factories.Add(factory);
        return factory.WithWebHostBuilder(b => b.UseEnvironment("Production").UseWebRoot(_webRoot)).CreateClient();
    }

    private static async Task<(HttpStatusCode Status, string? MediaType, string Body)> Get(HttpClient client, string path)
    {
        var response = await client.GetAsync(path, Ct);
        return (response.StatusCode, response.Content.Headers.ContentType?.MediaType, await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task In_production_health_reports_an_unreachable_database_instead_of_serving_the_page()
    {
        var (status, mediaType, body) = await Get(ProductionClient(UnreachableMongo), "/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, status);
        Assert.NotEqual("text/html", mediaType);
        Assert.Equal("Unhealthy", body);
    }

    [Fact]
    public async Task In_production_health_is_healthy_with_the_database_up()
    {
        var (status, _, body) = await Get(ProductionClient(mongo.NewConnectionString()), "/health");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Healthy", body);
    }

    [Fact]
    public async Task In_production_alive_does_not_depend_on_the_database()
    {
        // A restart can't fix the database, so liveness must not fail with it.
        var (status, mediaType, body) = await Get(ProductionClient(UnreachableMongo), "/alive");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.NotEqual("text/html", mediaType);
        Assert.Equal("Healthy", body);
    }

    [Fact]
    public void A_connection_string_without_a_database_name_stops_startup()
    {
        // From step 2: DocumentDB's portal string has none, and every request was then a 500.
        var error = Assert.ThrowsAny<Exception>(() => ProductionClient("mongodb://localhost:1/?tls=false"));

        Assert.Contains("must name the database", error.ToString());
    }
}
