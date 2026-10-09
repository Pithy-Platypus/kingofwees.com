using System.Diagnostics;
using System.Net;
using KingOfWees.Server.Admin;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using OpenTelemetry;
using OpenTelemetry.Trace;

namespace KingOfWees.Server.Tests.Api;

// The privacy page promises IP addresses aren't kept; request traces are where they would leak.
public sealed class TelemetryPrivacyTests
{
    [Fact]
    public async Task Request_traces_carry_no_ip_address_user_agent_or_query_string()
    {
        var spans = new List<Activity>();
        await using var factory = new KingApiFactory().WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
                services.ConfigureOpenTelemetryTracerProvider(tracing => tracing.AddInMemoryExporter(spans))));

        // A known trace id identifies this request's span: listeners are process-wide, so spans from
        // other tests' servers running in parallel land in the same exporter.
        var traceId = ActivityTraceId.CreateRandom();

        // Set the client IP before the request starts, as a real connection would.
        await factory.Server.SendAsync(context =>
        {
            context.Request.Method = "GET";
            context.Request.Path = "/api/king/status";
            context.Request.QueryString = new("?locale=en-XA");
            context.Request.Headers.UserAgent = "KingTest/1.0";
            context.Request.Headers.TraceParent = $"00-{traceId}-{ActivitySpanId.CreateRandom()}-01";
            context.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.7");
        }, TestContext.Current.CancellationToken);
        var span = await ServerSpan(spans, traceId);
        Assert.Contains(span.TagObjects, t => t.Key == "http.route");
        Assert.DoesNotContain(span.TagObjects, t => t.Key is "client.address" or "client.port" or "user_agent.original" or "url.query");
    }

    [Fact]
    public async Task Request_traces_never_carry_the_admin_key()
    {
        const string key = "telemetry-admin-key";
        var spans = new List<Activity>();
        await using var factory = new KingApiFactory(settings: [("King:Admin:KeyHash", AdminKeyHasher.Hash(key))])
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
                services.ConfigureOpenTelemetryTracerProvider(tracing => tracing.AddInMemoryExporter(spans))));
        var traceId = ActivityTraceId.CreateRandom();

        var response = await factory.Server.SendAsync(context =>
        {
            context.Request.Method = "GET";
            context.Request.Path = "/api/admin/check";
            context.Request.Headers.Authorization = $"Bearer {key}";
            context.Request.Headers.TraceParent = $"00-{traceId}-{ActivitySpanId.CreateRandom()}-01";
        }, TestContext.Current.CancellationToken);
        var span = await ServerSpan(spans, traceId);

        Assert.Equal(StatusCodes.Status204NoContent, response.Response.StatusCode);
        Assert.DoesNotContain(span.TagObjects, t => t.Key.Contains("authorization", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(span.TagObjects, t => t.Value?.ToString()?.Contains(key) == true);
    }

    // The request's activity stops (and is exported) just after the response completes, so wait for it.
    private static async Task<Activity> ServerSpan(List<Activity> spans, ActivityTraceId traceId)
    {
        for (var attempt = 0; attempt < 50; attempt++)
        {
            lock (spans)
            {
                var span = spans.SingleOrDefault(s => s.Kind == ActivityKind.Server && s.TraceId == traceId);
                if (span is not null) return span;
            }
            await Task.Delay(20, TestContext.Current.CancellationToken);
        }
        throw new Xunit.Sdk.XunitException("No server span was exported within one second.");
    }
}
