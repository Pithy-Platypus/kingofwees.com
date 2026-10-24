using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;

namespace KingOfWees.Server.Tests.Api;

// The browser reports what broke on the page itself; the server logs it as one warning and stores nothing.
public sealed class ClientDiagnosticsApiTests
{
    private const string Route = "/api/client-diagnostics";
    private const string TrustProxy = "King:Proxy:TrustForwardedFor";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Dictionary<string, object?> Report(params (string Key, object? Value)[] changes)
    {
        var report = new Dictionary<string, object?>
        {
            ["kind"] = "render",
            ["message"] = "Cannot read properties of null (reading 'map')",
            ["stack"] = "TypeError: Cannot read properties of null\n    at Lately (index-abc.js:1:200)",
            ["path"] = "/history",
            ["version"] = "2026.10.20+0123456789ab",
        };
        foreach (var (key, value) in changes) report[key] = value;
        return report;
    }

    private static (WebApplicationFactory<KingOfWees.Server.King.KingEvent> Factory, ExportedLogs Logs) Create(
        params (string Key, string Value)[] settings)
    {
        var logs = new ExportedLogs();
        var factory = new KingApiFactory(settings: settings).WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.ConfigureOpenTelemetryLoggerProvider(logging => logging.AddProcessor(logs))));
        return (factory, logs);
    }

    private static Task<HttpResponseMessage> Post(WebApplicationFactory<KingOfWees.Server.King.KingEvent> factory, object report,
        string? forwardedFor = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = JsonContent.Create(report) };
        if (forwardedFor is not null) request.Headers.Add("X-Forwarded-For", forwardedFor);
        return factory.CreateClient().SendAsync(request, Ct);
    }

    [Fact]
    public async Task A_report_is_logged_as_one_warning_with_its_fields()
    {
        var (factory, logs) = Create();
        await using var _ = factory;

        var response = await Post(factory, Report());

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var record = Assert.Single(logs.Diagnostics);
        Assert.Equal(LogLevel.Warning, record.Level);
        Assert.Equal("render", record.Attributes["Kind"]);
        Assert.Equal("/history", record.Attributes["Path"]);
        Assert.Equal("2026.10.20+0123456789ab", record.Attributes["Version"]);
        Assert.Equal("Cannot read properties of null (reading 'map')", record.Attributes["Message"]);
        Assert.Equal("TypeError: Cannot read properties of null\n    at Lately (index-abc.js:1:200)", record.Attributes["Stack"]);
    }

    [Fact]
    public async Task Without_a_stack_or_version_the_report_is_still_logged()
    {
        var (factory, logs) = Create();
        await using var _ = factory;

        var response = await Post(factory, Report(("stack", null), ("version", null)));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Single(logs.Diagnostics);
    }

    public static TheoryData<string, object?, string> Refused => new()
    {
        { "kind", null, "kind.required" },
        { "kind", "warning", "kind.unknown" },
        { "message", null, "message.required" },
        { "message", " \u200B ", "message.required" },
        { "message", new string('m', 501), "message.tooLong" },
        { "stack", new string('s', 1501), "stack.tooLong" },
        { "path", null, "path.required" },
        { "path", "history", "path.invalid" },
        { "path", "/history?locale=en-XA", "path.invalid" },
        { "path", "/history#top", "path.invalid" },
        { "path", "/" + new string('p', 200), "path.tooLong" },
        { "version", new string('v', 65), "version.tooLong" },
    };

    [Theory]
    [MemberData(nameof(Refused))]
    public async Task A_bad_report_is_refused_with_its_code_and_not_logged(string field, object? value, string code)
    {
        var (factory, logs) = Create();
        await using var _ = factory;

        var response = await Post(factory, Report((field, value)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("errors");
        Assert.Equal(code, errors.GetProperty(field).EnumerateArray().Single().GetString());
        Assert.Empty(logs.Diagnostics);
    }

    [Fact]
    public async Task Invisible_characters_are_removed_but_the_stack_keeps_its_lines()
    {
        var (factory, logs) = Create();
        await using var _ = factory;

        await Post(factory, Report(
            ("message", "Boom\u202E!"),
            ("path", "/hist\u200Bory"),
            ("stack", "Error: Boom\u202E\n    at a (x.js:1:1)\n    at b (x.js:2:2)")));

        var record = Assert.Single(logs.Diagnostics);
        Assert.Equal("Boom!", record.Attributes["Message"]);
        Assert.Equal("/history", record.Attributes["Path"]);
        Assert.Equal("Error: Boom\n    at a (x.js:1:1)\n    at b (x.js:2:2)", record.Attributes["Stack"]);
    }

    [Fact]
    public async Task Each_visitor_has_a_limit_a_minute()
    {
        var (factory, logs) = Create((TrustProxy, "true"), ("RateLimiting:ClientDiagnosticsPerMinute", "1"));
        await using var _ = factory;

        Assert.Equal(HttpStatusCode.NoContent, (await Post(factory, Report(), "198.51.100.1")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(factory, Report(), "198.51.100.2")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(factory, Report(), "198.51.100.1")).StatusCode);
        Assert.Equal(2, logs.Diagnostics.Count);
    }

    [Fact]
    public async Task Every_visitor_together_has_a_limit_a_minute()
    {
        // A flood from many addresses mustn't spend the workspace's daily cap and blind telemetry for the rest of the day.
        var (factory, logs) = Create((TrustProxy, "true"), ("RateLimiting:ClientDiagnosticsTotalPerMinute", "2"));
        await using var _ = factory;

        // A refused report doesn't spend the shared limit.
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(factory, Report(("kind", "warning")), "198.51.100.1")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(factory, Report(), "198.51.100.1")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(factory, Report(), "198.51.100.2")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(factory, Report(), "198.51.100.3")).StatusCode);
        Assert.Equal(2, logs.Diagnostics.Count);
    }

    [Fact]
    public async Task A_report_that_isn_t_json_is_refused()
    {
        // Another site can send text/plain without asking the browser first; application/json needs a preflight,
        // which this site never answers.
        var (factory, logs) = Create();
        await using var _ = factory;

        var response = await factory.CreateClient().PostAsync(Route,
            new StringContent(JsonSerializer.Serialize(Report()), Encoding.UTF8, "text/plain"), Ct);

        // The endpoint matches only JSON, so this falls through to the /api fallback.
        Assert.False(response.IsSuccessStatusCode);
        Assert.Empty(logs.Diagnostics);
    }

    [Fact]
    public async Task A_visitor_outside_the_US_can_report()
    {
        var database = Path.Combine(AppContext.BaseDirectory, "TestData", "GeoIP2-Country-Test.mmdb");
        var (factory, logs) = Create((TrustProxy, "true"), ("King:Posting:CountryDatabase", database));
        await using var _ = factory;

        var response = await Post(factory, Report(), forwardedFor: "81.2.69.160"); // GB in MaxMind's test database

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Single(logs.Diagnostics);
    }

    [Fact]
    public async Task The_log_carries_no_address_or_user_agent()
    {
        var (factory, logs) = Create((TrustProxy, "true"));
        await using var _ = factory;
        var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = JsonContent.Create(Report()) };
        request.Headers.Add("X-Forwarded-For", "198.51.100.23");
        request.Headers.UserAgent.ParseAdd("KingTest/1.0");

        await factory.CreateClient().SendAsync(request, Ct);

        Assert.Single(logs.Diagnostics);
        Assert.DoesNotContain(logs.Lines, line => line.Contains("198.51.100.23") || line.Contains("KingTest/1.0"));
    }

    private sealed record ExportedRecord(string? Category, LogLevel Level, IReadOnlyDictionary<string, object?> Attributes);

    // Keeps each exported record as values and as text (message, attributes, scopes): the SDK reuses LogRecord objects.
    private sealed class ExportedLogs : BaseProcessor<LogRecord>
    {
        private readonly List<ExportedRecord> records = [];
        private readonly List<string> lines = [];

        public IReadOnlyList<ExportedRecord> Diagnostics
        {
            get { lock (records) return [.. records.Where(r => r.Category == "KingOfWees.Server.Diagnostics.ClientDiagnostic")]; }
        }

        public IReadOnlyList<string> Lines { get { lock (lines) return [.. lines]; } }

        public override void OnEnd(LogRecord record)
        {
            var attributes = (record.Attributes ?? []).ToDictionary(a => a.Key, a => a.Value);
            var text = new List<string> { record.FormattedMessage ?? "", record.Body ?? "" };
            text.AddRange(attributes.Select(a => $"{a.Key}={a.Value}"));
            record.ForEachScope((scope, _) =>
            {
                foreach (var item in scope) text.Add($"{item.Key}={item.Value}");
            }, (object?)null);
            lock (records) records.Add(new(record.CategoryName, record.LogLevel, attributes));
            lock (lines) lines.Add(string.Join(" | ", text));
        }
    }
}
