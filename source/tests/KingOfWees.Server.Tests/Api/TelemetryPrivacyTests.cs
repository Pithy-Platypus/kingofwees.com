using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using KingOfWees.Server.Admin;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Trace;

namespace KingOfWees.Server.Tests.Api;

// The privacy page promises IP addresses aren't kept; request traces and exported logs are where they would leak.
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
    public async Task Request_traces_carry_no_forwarded_visitor_address()
    {
        var spans = new List<Activity>();
        await using var factory = new KingApiFactory(settings: [("King:Proxy:TrustForwardedFor", "true")])
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
                services.ConfigureOpenTelemetryTracerProvider(tracing => tracing.AddInMemoryExporter(spans))));
        var traceId = ActivityTraceId.CreateRandom();

        await factory.Server.SendAsync(context =>
        {
            context.Request.Method = "GET";
            context.Request.Path = "/api/king/status";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.23";
            context.Request.Headers.TraceParent = $"00-{traceId}-{ActivitySpanId.CreateRandom()}-01";
        }, TestContext.Current.CancellationToken);
        var span = await ServerSpan(spans, traceId);

        Assert.DoesNotContain(span.TagObjects, t => t.Key is "client.address" or "network.peer.address");
        Assert.DoesNotContain(span.TagObjects, t => t.Value?.ToString()?.Contains("198.51.100.23") == true);
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

    [Fact]
    public async Task Request_traces_never_carry_the_name_an_admin_typed()
    {
        const string key = "telemetry-admin-key";
        const string name = "Telemetry-Admin-Name";
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
            context.Request.Headers[AdminAudit.NameHeader] = name;
            context.Request.Headers.TraceParent = $"00-{traceId}-{ActivitySpanId.CreateRandom()}-01";
        }, TestContext.Current.CancellationToken);
        var span = await ServerSpan(spans, traceId);

        Assert.Equal(StatusCodes.Status204NoContent, response.Response.StatusCode);
        Assert.DoesNotContain(span.TagObjects, t => t.Value?.ToString()?.Contains(name) == true);
    }

    [Fact]
    public async Task A_hidden_photo_s_note_never_reaches_traces_or_logs()
    {
        const string key = "telemetry-admin-key";
        const string note = "Telemetry-Hide-Note";
        var spans = new List<Activity>();
        var exported = new ExportedLogText();
        var app = new KingApiFactory(settings: [("King:Admin:KeyHash", AdminKeyHasher.Hash(key))]);
        await using var factory = app.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.ConfigureOpenTelemetryTracerProvider(tracing => tracing.AddInMemoryExporter(spans));
            services.ConfigureOpenTelemetryLoggerProvider(logging => logging.AddProcessor(exported));
        }));
        var photo = new KingOfWees.Server.Photos.Photo(Guid.CreateVersion7().ToString(), null, DateTimeOffset.UnixEpoch, "device", null);
        await app.Photos.AddAsync(photo, TestContext.Current.CancellationToken);

        // Hidden with the note, then refused with it (a validation failure is where request text would most likely leak).
        foreach (var (body, status) in new[]
        {
            ($$"""{"reason":"other","note":"{{note}}"}""", StatusCodes.Status204NoContent),
            ($$"""{"reason":"other","note":"{{note}}{{new string('x', 200)}}"}""", StatusCodes.Status400BadRequest),
        })
        {
            // An HttpClient request: TestServer's SendAsync(context => …) marks a request as having no body.
            var traceId = ActivityTraceId.CreateRandom();
            var request = new HttpRequestMessage(HttpMethod.Post, $"/api/admin/photos/{photo.Id}/hide")
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new("Bearer", key);
            request.Headers.Add("traceparent", $"00-{traceId}-{ActivitySpanId.CreateRandom()}-01");
            var response = await factory.CreateClient().SendAsync(request, TestContext.Current.CancellationToken);
            var span = await ServerSpan(spans, traceId);

            Assert.Equal(status, (int)response.StatusCode);
            Assert.DoesNotContain(span.TagObjects, t => t.Value?.ToString()?.Contains(note) == true);
            Assert.DoesNotContain(span.Events, e => e.Tags.Any(t => t.Value?.ToString()?.Contains(note) == true));
        }
        Assert.DoesNotContain(exported.Lines, line => line.Contains(note, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Exported_logs_carry_no_address_user_agent_query_device_key_or_admin_secrets()
    {
        const string key = "telemetry-admin-key";
        string[] personal = ["203.0.113.7", "198.51.100.23", "KingTest/1.0", "locale=en-XA", "telemetry-device-key", key, "Telemetry-Admin-Name"];
        var exported = new ExportedLogText();
        await using var factory = new KingApiFactory(settings: [("King:Admin:KeyHash", AdminKeyHasher.Hash(key)), ("King:Proxy:TrustForwardedFor", "true")])
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
                services.ConfigureOpenTelemetryLoggerProvider(logging => logging.AddProcessor(exported))));

        foreach (var (method, path, authorization) in new[]
        {
            ("GET", "/api/king/status", null),
            ("POST", "/api/king/sightings", null),
            ("GET", "/api/admin/check", key),
            ("GET", "/api/admin/check", "wrong-key"),
        })
        {
            await factory.Server.SendAsync(context =>
            {
                context.Request.Method = method;
                context.Request.Path = path;
                context.Request.QueryString = new("?locale=en-XA");
                context.Request.Headers.UserAgent = "KingTest/1.0";
                context.Request.Headers["X-Forwarded-For"] = "198.51.100.23";
                context.Request.Headers[AdminAudit.NameHeader] = "Telemetry-Admin-Name";
                if (authorization is not null) context.Request.Headers.Authorization = $"Bearer {authorization}";
                if (method == "POST")
                {
                    context.Request.ContentType = "application/json";
                    context.Request.Body = new MemoryStream("""{"reporterKey":"telemetry-device-key"}"""u8.ToArray());
                }
                context.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.7");
            }, TestContext.Current.CancellationToken);
        }

        foreach (var value in personal)
        {
            Assert.DoesNotContain(exported.Lines, line => line.Contains(value, StringComparison.OrdinalIgnoreCase));
        }
    }

    // Keeps each exported record as text (message, attributes, scopes, exception): the SDK reuses LogRecord objects.
    [Fact]
    public async Task A_refused_request_is_logged_with_its_route_and_codes_and_never_what_was_sent()
    {
        // Until 2026-10-25 a 400 was a status code and nothing else. Now one line names the route and the codes (the
        // workbook's Triage tab reads it); the value stays the visitor's.
        var nickname = "Telemetry-Nickname-" + new string('x', 30); // past the 40-character limit
        var exported = new ExportedLogText();
        await using var factory = new KingApiFactory().WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.ConfigureOpenTelemetryLoggerProvider(logging => logging.AddProcessor(exported))));
        var client = factory.CreateClient();

        var refused = await client.PostAsJsonAsync("/api/king/sightings",
            new { reporterKey = "telemetry-device", reporterName = nickname }, TestContext.Current.CancellationToken);
        var logged = await client.PostAsJsonAsync("/api/king/sightings",
            new { reporterKey = "telemetry-device", reporterName = "Sarah" }, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal(HttpStatusCode.Created, logged.StatusCode);
        var line = Assert.Single(exported.Lines, l => l.Contains("Refused POST /api/king/sightings"));
        Assert.Contains("reporterName: reporterName.tooLong", line);
        Assert.DoesNotContain(exported.Lines, l => l.Contains(nickname) || l.Contains("Sarah"));
    }

    private sealed class ExportedLogText : BaseProcessor<LogRecord>
    {
        private readonly List<string> lines = [];

        public IReadOnlyList<string> Lines { get { lock (lines) return [.. lines]; } }

        public override void OnEnd(LogRecord record)
        {
            var text = new List<string> { record.FormattedMessage ?? "", record.Body ?? "", record.Exception?.ToString() ?? "" };
            text.AddRange(record.Attributes?.Select(a => $"{a.Key}={a.Value}") ?? []);
            record.ForEachScope((scope, _) =>
            {
                foreach (var item in scope) text.Add($"{item.Key}={item.Value}");
            }, (object?)null);
            lock (lines) lines.Add(string.Join(" | ", text));
        }
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
