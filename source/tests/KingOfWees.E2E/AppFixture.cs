using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using KingOfWees.E2E;
using Microsoft.Playwright;

[assembly: AssemblyFixture(typeof(AppFixture))]

namespace KingOfWees.E2E;

// Boots the real AppHost (API, Vite, Mongo) once per test run and shares one Chromium.
public sealed class AppFixture : IAsyncLifetime
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(3);

    // A made-up center (not King's street); the server rounds it like any coordinate.
    public const double MapLatitude = 45.523;
    public const double MapLongitude = -122.677;

    // Where every test browser says it is; deliberately finer than a block, to prove it gets rounded.
    public const float DeviceLatitude = 45.524567f;
    public const float DeviceLongitude = -122.678912f;

    // 1×1 transparent PNG: map tiles are stubbed so tests never call OpenStreetMap.
    private static readonly byte[] BlankTile = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");

    private DistributedApplication? _app;
    private IPlaywright? _playwright;
    private IBrowser? _browser;

    public Uri BaseUrl { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        // Program.Main is Playwright's own CLI; this avoids needing PowerShell for playwright.ps1.
        var exitCode = Microsoft.Playwright.Program.Main(["install", "chromium"]);
        if (exitCode != 0)
        {
            throw new InvalidOperationException($"Playwright browser install failed with exit code {exitCode}.");
        }

        using var cts = new CancellationTokenSource(StartupTimeout);
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.KingOfWees_AppHost>(
            ["PersistData=false"], cts.Token);
        builder.CreateResourceBuilder<ProjectResource>("server")
            .WithEnvironment("King__Map__Center__Latitude", MapLatitude.ToString(System.Globalization.CultureInfo.InvariantCulture))
            .WithEnvironment("King__Map__Center__Longitude", MapLongitude.ToString(System.Globalization.CultureInfo.InvariantCulture));
        _app = await builder.BuildAsync(cts.Token);
        await _app.StartAsync(cts.Token);
        await _app.ResourceNotifications.WaitForResourceHealthyAsync("server", cts.Token);
        await _app.ResourceNotifications.WaitForResourceAsync("webfrontend", KnownResourceStates.Running, cts.Token);
        BaseUrl = _app.GetEndpoint("webfrontend", "http");

        _playwright = await Playwright.CreateAsync();
        _browser = await _playwright.Chromium.LaunchAsync();
    }

    public async Task<IPage> NewPageAsync()
    {
        var context = await _browser!.NewContextAsync(new()
        {
            BaseURL = BaseUrl.ToString(),
            Geolocation = new() { Latitude = DeviceLatitude, Longitude = DeviceLongitude },
            Permissions = ["geolocation"],
        });
        await context.RouteAsync("https://tile.openstreetmap.org/**", route =>
            route.FulfillAsync(new() { ContentType = "image/png", BodyBytes = BlankTile }));
        return await context.NewPageAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if (_browser is not null) await _browser.DisposeAsync();
        _playwright?.Dispose();
        if (_app is not null) await _app.DisposeAsync();
    }
}
