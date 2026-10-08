using Aspire.Hosting;
using Aspire.Hosting.Testing;
using MongoDB.Driver;

namespace KingOfWees.Server.Tests.King;

// Runs the AppHost with a throwaway Mongo container; each test gets its own database.
public sealed class MongoAppFixture : IAsyncLifetime
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(3);

    private DistributedApplication? _app;
    private MongoClient? _client;

    public IMongoDatabase NewDatabase() => _client!.GetDatabase($"test-{Guid.NewGuid():N}");

    public async ValueTask InitializeAsync()
    {
        using var cts = new CancellationTokenSource(StartupTimeout);
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.KingOfWees_AppHost>(
            ["PersistData=false"], cts.Token);
        _app = await builder.BuildAsync(cts.Token);
        await _app.StartAsync(cts.Token);
        await _app.ResourceNotifications.WaitForResourceHealthyAsync("mongo", cts.Token);
        _client = new MongoClient(await _app.GetConnectionStringAsync("mongo", cts.Token));
    }

    public async ValueTask DisposeAsync()
    {
        _client?.Dispose();
        if (_app is not null) await _app.DisposeAsync();
    }
}
