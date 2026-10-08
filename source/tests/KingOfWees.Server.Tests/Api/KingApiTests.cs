using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentValidation;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;
using System.Diagnostics.Metrics;

namespace KingOfWees.Server.Tests.Api;

public sealed class KingApiTests : IAsyncLifetime
{
    private const string DeviceKey = "device-key-1";
    private const string ReporterKeyHeader = "X-Reporter-Key";

    private readonly KingApiFactory _factory = new();
    private HttpClient _client = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        _client = _factory.CreateClient();
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private Task<HttpResponseMessage> LogFeeding(object body) => _client.PostAsJsonAsync("/api/king/feedings", body, Ct);

    private Task<HttpResponseMessage> LogSighting(object body) => _client.PostAsJsonAsync("/api/king/sightings", body, Ct);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct));

    private async Task<JsonElement> Status() => await Json(await _client.GetAsync("/api/king/status", Ct));

    private Task<HttpResponseMessage> Undo(string id, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/king/events/{id}");
        request.Headers.Add(ReporterKeyHeader, key);
        return _client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Logging_a_feeding_returns_201_with_the_event_stamped_by_the_server_clock()
    {
        var response = await LogFeeding(new { reporterKey = DeviceKey, reporterName = "Jamie", foods = new[] { "dry", "treats" } });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await Json(response);
        Assert.Equal("fed", body.GetProperty("kind").GetString());
        Assert.Equal("Jamie", body.GetProperty("reporterName").GetString());
        Assert.Equal(["dry", "treats"], body.GetProperty("foods").EnumerateArray().Select(f => f.GetString()));
        Assert.Equal(_factory.Clock.GetUtcNow(), body.GetProperty("occurredAt").GetDateTimeOffset());
        Assert.Equal($"/api/king/events/{body.GetProperty("id").GetString()}", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task Logging_a_sighting_returns_201_without_foods()
    {
        var response = await LogSighting(new { reporterKey = DeviceKey });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await Json(response);
        Assert.Equal("seen", body.GetProperty("kind").GetString());
        Assert.Equal(0, body.GetProperty("foods").GetArrayLength());
    }

    [Fact]
    public async Task The_reporter_key_is_never_returned()
    {
        var created = await LogFeeding(new { reporterKey = DeviceKey });
        var status = await _client.GetStringAsync("/api/king/status", Ct);

        Assert.DoesNotContain(DeviceKey, await created.Content.ReadAsStringAsync(Ct));
        Assert.DoesNotContain(DeviceKey, status);
    }

    [Fact]
    public async Task Status_is_empty_before_anything_is_logged()
    {
        var status = await Status();

        Assert.Equal(JsonValueKind.Null, status.GetProperty("lastFed").ValueKind);
        Assert.Equal(JsonValueKind.Null, status.GetProperty("lastSeen").ValueKind);
        Assert.Equal(0, status.GetProperty("recent").GetArrayLength());
    }

    [Fact]
    public async Task Status_shows_the_latest_feeding_and_sighting_and_recent_events_newest_first()
    {
        await LogFeeding(new { reporterKey = DeviceKey, reporterName = "First" });
        _factory.Clock.Advance(TimeSpan.FromMinutes(5));
        await LogSighting(new { reporterKey = DeviceKey, reporterName = "Second" });
        _factory.Clock.Advance(TimeSpan.FromMinutes(5));
        await LogFeeding(new { reporterKey = DeviceKey, reporterName = "Third" });

        var status = await Status();

        Assert.Equal("Third", status.GetProperty("lastFed").GetProperty("reporterName").GetString());
        Assert.Equal("Second", status.GetProperty("lastSeen").GetProperty("reporterName").GetString());
        Assert.Equal(
            ["Third", "Second", "First"],
            status.GetProperty("recent").EnumerateArray().Select(e => e.GetProperty("reporterName").GetString()));
    }

    [Fact]
    public async Task Recent_events_are_capped_at_ten()
    {
        for (var i = 0; i < 11; i++)
        {
            await LogSighting(new { reporterKey = DeviceKey });
            _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        }

        Assert.Equal(10, (await Status()).GetProperty("recent").GetArrayLength());
    }

    [Theory]
    [InlineData("""{ "reporterName": "Jamie" }""", "reporterKey.required")]
    [InlineData("""{ "reporterKey": "" }""", "reporterKey.required")]
    [InlineData("""{ "reporterKey": "k", "reporterName": "1234567890123456789012345678901234567890X" }""", "reporterName.tooLong")]
    public async Task Invalid_requests_are_rejected_with_error_codes_not_sentences(string json, string code)
    {
        var response = await _client.PostAsync(
            "/api/king/feedings", new StringContent(json, System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await Json(response)).GetProperty("errors");
        Assert.Contains(code, errors.EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString()));
        Assert.Empty(await _factory.Store.GetRecentAsync(10, Ct));
    }

    [Fact]
    public async Task Numeric_food_outside_the_known_values_is_rejected_with_an_error_code()
    {
        var response = await LogFeeding(new { reporterKey = DeviceKey, foods = new object[] { "wet", 7 } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await Json(response)).GetProperty("errors");
        Assert.Contains("food.invalid", errors.EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString()));
        Assert.Empty(await _factory.Store.GetRecentAsync(10, Ct));
    }

    [Fact]
    public async Task Unknown_food_is_rejected()
    {
        var response = await LogFeeding(new { reporterKey = DeviceKey, foods = new[] { "lasagna" } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_same_device_can_undo_within_ten_minutes()
    {
        var id = (await Json(await LogFeeding(new { reporterKey = DeviceKey }))).GetProperty("id").GetString()!;
        _factory.Clock.Advance(TimeSpan.FromMinutes(10));

        var response = await Undo(id, DeviceKey);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await _factory.Store.FindAsync(id, Ct));
    }

    [Fact]
    public async Task Another_device_cannot_undo_and_learns_nothing()
    {
        var id = (await Json(await LogFeeding(new { reporterKey = DeviceKey }))).GetProperty("id").GetString()!;

        var response = await Undo(id, "someone-else");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotNull(await _factory.Store.FindAsync(id, Ct));
    }

    [Fact]
    public async Task Undo_after_ten_minutes_is_refused_with_an_error_code()
    {
        var id = (await Json(await LogFeeding(new { reporterKey = DeviceKey }))).GetProperty("id").GetString()!;
        _factory.Clock.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));

        var response = await Undo(id, DeviceKey);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("undo.expired", (await Json(response)).GetProperty("type").GetString());
        Assert.NotNull(await _factory.Store.FindAsync(id, Ct));
    }

    [Fact]
    public async Task Undo_of_an_unknown_event_is_404()
    {
        var response = await Undo(Guid.CreateVersion7().ToString(), DeviceKey);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public void Every_write_endpoint_requires_the_CanPost_policy()
    {
        var writes = _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Any(m => m is "POST" or "PUT" or "PATCH" or "DELETE") == true)
            .ToList();

        Assert.NotEmpty(writes);
        Assert.All(writes, e => Assert.Contains(e.Metadata.GetOrderedMetadata<IAuthorizeData>(), a => a.Policy == "CanPost"));
    }

    [Fact]
    public void Every_request_body_type_has_a_FluentValidation_validator()
    {
        var bodyTypes = _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .Select(e => e.Metadata.GetMetadata<IAcceptsMetadata>()?.RequestType)
            .OfType<Type>()
            .Distinct()
            .ToList();

        Assert.NotEmpty(bodyTypes);
        Assert.All(bodyTypes, type =>
            Assert.NotNull(_factory.Services.GetService(typeof(IValidator<>).MakeGenericType(type))));
    }

    [Fact]
    public async Task Feedings_and_sightings_are_counted()
    {
        var meterFactory = _factory.Services.GetRequiredService<IMeterFactory>();
        using var feedings = new MetricCollector<long>(meterFactory, "KingOfWees", "king.feedings");
        using var sightings = new MetricCollector<long>(meterFactory, "KingOfWees", "king.sightings");

        await LogFeeding(new { reporterKey = DeviceKey });
        await LogFeeding(new { reporterKey = DeviceKey });
        await LogSighting(new { reporterKey = DeviceKey });

        Assert.Equal(2, feedings.GetMeasurementSnapshot().EvaluateAsCounter());
        Assert.Equal(1, sightings.GetMeasurementSnapshot().EvaluateAsCounter());
    }
}

public sealed class RateLimitTests
{
    [Fact]
    public async Task Writes_beyond_the_per_minute_limit_get_429()
    {
        await using var factory = new KingApiFactory(writesPerMinute: 2);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.PostAsJsonAsync("/api/king/sightings", new { reporterKey = "k" }, ct)).StatusCode);
        }

        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Created, HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task Reads_are_not_rate_limited()
    {
        await using var factory = new KingApiFactory(writesPerMinute: 1);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/king/status", ct)).StatusCode);
        }
    }
}
