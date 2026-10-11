using Aspire.Hosting;
using Aspire.Hosting.Testing;
using MongoDB.Driver;

namespace KingOfWees.Server.Tests.King;

// Runs the AppHost with a throwaway Mongo container; each test gets its own database.
// With KING_TEST_MONGO set (a connection string, e.g. a DocumentDB cluster) the tests use that server instead
// and drop their databases afterwards.
public sealed class MongoAppFixture : IAsyncLifetime
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(3);

    private readonly List<string> _databases = [];
    private DistributedApplication? _app;
    private MongoClient? _client;
    private string? _connectionString;

    // A connection string naming a fresh database, for tests that start the server against this Mongo.
    public string NewConnectionString() =>
        new MongoUrlBuilder(_connectionString) { DatabaseName = NewDatabase().DatabaseNamespace.DatabaseName }.ToString();

    public IMongoDatabase NewDatabase()
    {
        var name = $"test-{Guid.NewGuid():N}";
        lock (_databases) _databases.Add(name);
        return _client!.GetDatabase(name);
    }

    public async ValueTask InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("KING_TEST_MONGO");
        if (!string.IsNullOrWhiteSpace(external))
        {
            _connectionString = external;
            _client = new MongoClient(external);
            return;
        }

        using var cts = new CancellationTokenSource(StartupTimeout);
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.KingOfWees_AppHost>(
            ["PersistData=false"], cts.Token);
        _app = await builder.BuildAsync(cts.Token);
        await _app.StartAsync(cts.Token);
        await _app.ResourceNotifications.WaitForResourceHealthyAsync("mongo", cts.Token);
        _connectionString = await _app.GetConnectionStringAsync("mongo", cts.Token);
        _client = new MongoClient(_connectionString);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null && _client is not null)
        {
            foreach (var name in _databases) await _client.DropDatabaseAsync(name);
        }
        _client?.Dispose();
        if (_app is not null) await _app.DisposeAsync();
    }
}
