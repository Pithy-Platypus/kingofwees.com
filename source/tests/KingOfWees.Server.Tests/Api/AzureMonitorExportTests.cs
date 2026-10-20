using System.Diagnostics;
using Azure.Monitor.OpenTelemetry.Exporter;
using KingOfWees.Server.King;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace KingOfWees.Server.Tests.Api;

// Production sends telemetry straight to Application Insights. Nothing here reaches Azure: the ingestion address is a
// closed local port.
public sealed class AzureMonitorExportTests
{
    private const string ConnectionString =
        "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://127.0.0.1:9/";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static WebApplicationFactory<KingEvent> WithAzureMonitor() =>
        new KingApiFactory(settings: [("APPLICATIONINSIGHTS_CONNECTION_STRING", ConnectionString)])
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
                // Nothing here is worth a retry: a failed send would otherwise wait in the temp folder for good.
                services.PostConfigureAll<AzureMonitorExporterOptions>(options => options.DisableOfflineStorage = true)));

    [Fact]
    public async Task Every_request_is_traced_even_one_whose_caller_asked_not_to_be_sampled()
    {
        // The event alerts count request rows, so none may be sampled away: not by the exporter's default (5 traces a
        // second), and not by a caller's traceparent.
        var spans = new List<Activity>();
        await using var factory = WithAzureMonitor().WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.ConfigureOpenTelemetryTracerProvider(tracing => tracing.AddInMemoryExporter(spans))));
        var traceIds = Enumerable.Range(0, 30).Select(_ => ActivityTraceId.CreateRandom()).ToHashSet();

        foreach (var traceId in traceIds)
        {
            await factory.Server.SendAsync(context =>
            {
                context.Request.Method = "GET";
                context.Request.Path = "/api/version";
                context.Request.Headers.TraceParent = $"00-{traceId}-{ActivitySpanId.CreateRandom()}-00";
            }, Ct);
        }

        Assert.Equal(traceIds.Count, await ServerSpanCount(spans, traceIds));
    }

    [Fact]
    public async Task Only_the_app_s_own_counters_are_exported()
    {
        // The runtime and ASP.NET Core instruments alone would pass the workspace's daily cap.
        var names = await ExportedMetricNames(WithAzureMonitor());

        Assert.Contains("king.sightings", names);
        Assert.All(names, name => Assert.StartsWith("king.", name));
    }

    [Fact]
    public async Task Without_Azure_Monitor_every_instrument_is_kept_for_the_dashboard()
    {
        var names = await ExportedMetricNames(new KingApiFactory());

        Assert.Contains("king.sightings", names);
        Assert.Contains("http.server.request.duration", names);
    }

    private static async Task<IReadOnlyList<string>> ExportedMetricNames(WebApplicationFactory<KingEvent> app)
    {
        var metrics = new List<Metric>();
        await using var factory = app.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.ConfigureOpenTelemetryMeterProvider(meters => meters.AddInMemoryExporter(metrics))));

        await factory.CreateClient().GetAsync("/api/version", Ct);
        factory.Services.GetRequiredService<KingMetrics>().SightingLogged();
        factory.Services.GetRequiredService<MeterProvider>().ForceFlush();

        return [.. metrics.Select(metric => metric.Name).Distinct()];
    }

    // Each request's activity stops (and is exported) just after its response completes, so wait for the last ones.
    private static async Task<int> ServerSpanCount(List<Activity> spans, HashSet<ActivityTraceId> traceIds)
    {
        var count = 0;
        for (var attempt = 0; attempt < 50 && count < traceIds.Count; attempt++)
        {
            await Task.Delay(20, Ct);
            lock (spans) count = spans.Count(s => s.Kind == ActivityKind.Server && traceIds.Contains(s.TraceId));
        }
        return count;
    }
}
