using KingOfWees.Server.King;
using KingOfWees.Server.Tests.King;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace KingOfWees.Server.Tests.Api;

// Hosts the real minimal-API pipeline with the in-memory store and a controllable clock.
public sealed class KingApiFactory(int writesPerMinute = 100) : WebApplicationFactory<KingEvent> // Any server type works; both AppHost and Server expose a public Program.
{
    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 10, 8, 12, 0, 0, TimeSpan.Zero));

    public InMemoryKingEventStore Store { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // The Mongo client is never contacted here; it only needs a well-formed connection string.
        builder.UseSetting("ConnectionStrings:king", "mongodb://localhost:1/king");
        builder.UseSetting("RateLimiting:WritesPerMinute", writesPerMinute.ToString());
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IKingEventStore>();
            services.AddSingleton<IKingEventStore>(Store);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }
}
