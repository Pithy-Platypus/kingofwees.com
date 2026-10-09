using KingOfWees.Server.King;
using KingOfWees.Server.Tests.King;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace KingOfWees.Server.Tests.Api;

// Hosts the real minimal-API pipeline with the in-memory store and a controllable clock.
public sealed class KingApiFactory(int writesPerMinute = 100, params (string Key, string Value)[] settings)
    : WebApplicationFactory<KingEvent> // Any server type works; both AppHost and Server expose a public Program.
{
    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 10, 8, 12, 0, 0, TimeSpan.Zero));

    public InMemoryHiddenReporterStore Hidden { get; } = new();

    // Both read Hidden, so a device hidden there leaves their reads.
    public InMemoryKingEventStore Store => field ??= new(Hidden);

    public InMemorySpotStore Spots => field ??= new(Hidden);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Development loads the developer's user-secrets (e.g. their real map center); tests must not depend on them.
        builder.ConfigureAppConfiguration((_, config) =>
        {
            foreach (var secrets in config.Sources.OfType<JsonConfigurationSource>().Where(s => s.Path == "secrets.json").ToList())
            {
                config.Sources.Remove(secrets);
            }
        });
        // The Mongo client is never contacted here; it only needs a well-formed connection string.
        builder.UseSetting("ConnectionStrings:king", "mongodb://localhost:1/king");
        builder.UseSetting("RateLimiting:WritesPerMinute", writesPerMinute.ToString());
        foreach (var (key, value) in settings)
        {
            builder.UseSetting(key, value);
        }
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IKingEventStore>();
            services.AddSingleton<IKingEventStore>(Store);
            services.RemoveAll<ISpotStore>();
            services.AddSingleton<ISpotStore>(Spots);
            services.RemoveAll<IHiddenReporterStore>();
            services.AddSingleton<IHiddenReporterStore>(Hidden);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }
}
