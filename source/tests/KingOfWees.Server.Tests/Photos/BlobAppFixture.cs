using Aspire.Hosting;
using Aspire.Hosting.Testing;
using System.Text.RegularExpressions;
using Azure.Storage.Blobs;

namespace KingOfWees.Server.Tests.Photos;

// Runs the AppHost with a throwaway Azurite container; each test gets its own blob container.
public sealed class BlobAppFixture : IAsyncLifetime
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(3);

    private DistributedApplication? _app;
    private BlobServiceClient? _service;

    public BlobContainerClient NewContainer()
    {
        var container = _service!.GetBlobContainerClient($"test-{Guid.NewGuid():N}");
        container.Create();
        return container;
    }

    public async ValueTask InitializeAsync()
    {
        using var cts = new CancellationTokenSource(StartupTimeout);
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.KingOfWees_AppHost>(
            ["PersistData=false"], cts.Token);
        _app = await builder.BuildAsync(cts.Token);
        await _app.StartAsync(cts.Token);
        await _app.ResourceNotifications.WaitForResourceHealthyAsync("photos", cts.Token);
        // Azurite's account connection string plus ";ContainerName=photos", which BlobServiceClient doesn't take.
        var connectionString = await _app.GetConnectionStringAsync("photos", cts.Token);
        _service = new BlobServiceClient(Regex.Replace(connectionString!, "ContainerName=[^;]*;?", ""));
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null) await _app.DisposeAsync();
    }
}
