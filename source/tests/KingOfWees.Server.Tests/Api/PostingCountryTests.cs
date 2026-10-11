using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Tests.Photos;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace KingOfWees.Server.Tests.Api;

// Posting (logging, adding places, undo, rename) only from a US address, when a country database is configured.
// Reading stays open to everyone. Addresses come from MaxMind's test database (TestData/README.md).
public sealed class PostingCountryTests
{
    private const string Us = "216.160.83.56";
    private const string Gb = "81.2.69.160";
    private const string NotInTheDatabase = "1.1.1.1";
    private static readonly string TestDatabase = Path.Combine(AppContext.BaseDirectory, "TestData", "GeoIP2-Country-Test.mmdb");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static KingApiFactory WithCountryDatabase(string path = "") =>
        new(settings: [("King:Proxy:TrustForwardedFor", "true"), ("King:Posting:CountryDatabase", path == "" ? TestDatabase : path)]);

    private static HttpRequestMessage Request(HttpMethod method, string path, string address, object? body = null) =>
        Request(method, path, address, body is null ? null : JsonContent.Create(body));

    private static HttpRequestMessage Request(HttpMethod method, string path, string address, HttpContent? content)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Add("X-Forwarded-For", address);
        request.Headers.Add("X-Reporter-Key", "k");
        return request;
    }

    // Every public write, each with a body that passes validation, so only the address decides.
    private static IEnumerable<HttpRequestMessage> EveryWrite(string address) =>
    [
        Request(HttpMethod.Post, "/api/king/feedings", address, new { reporterKey = "k", foods = new[] { "dry" } }),
        Request(HttpMethod.Post, "/api/king/sightings", address, new { reporterKey = "k" }),
        Request(HttpMethod.Post, "/api/king/spots", address, new { reporterKey = "k", name = "Porch", location = new { latitude = 45.523, longitude = -122.677 } }),
        Request(HttpMethod.Delete, "/api/king/events/some-id", address),
        Request(HttpMethod.Patch, "/api/king/events/some-id", address, new { reporterName = "Kit" }),
        Request(HttpMethod.Post, "/api/king/events/some-id/photo", address, PhotoForm()),
        Request(HttpMethod.Post, "/api/king/photos", address, PhotoForm(("reporterKey", "k"))),
        Request(HttpMethod.Delete, "/api/king/photos/some-id", address),
    ];

    private static MultipartFormDataContent PhotoForm(params (string Name, string Value)[] fields)
    {
        var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestJpeg.Make()), "photo", "photo.jpg" },
            { new ByteArrayContent(TestJpeg.Make()), "thumbnail", "thumbnail.jpg" },
        };
        foreach (var (name, value) in fields) form.Add(new StringContent(value), name);
        return form;
    }

    private static async Task<bool> Allowed(HttpClient client, string address)
    {
        var response = await client.SendAsync(Request(HttpMethod.Get, "/api/king/posting", address), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("allowed").GetBoolean();
    }

    [Fact]
    public async Task Every_write_from_outside_the_US_is_refused_with_a_code_and_nothing_is_stored()
    {
        await using var factory = WithCountryDatabase();
        var client = factory.CreateClient();

        foreach (var request in EveryWrite(Gb))
        {
            var response = await client.SendAsync(request, Ct);

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
            Assert.Equal("posting.outsideUs", problem.GetProperty("code").GetString());
        }
        var status = await client.GetFromJsonAsync<JsonElement>("/api/king/status", Ct);
        Assert.Empty(status.GetProperty("recent").EnumerateArray());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>("/api/king/spots", Ct)).EnumerateArray());
        Assert.Empty(await factory.Photos.GetPageAsync(null, 50, Ct));
    }

    [Theory]
    [InlineData(Us)]
    [InlineData(NotInTheDatabase)] // unknown: let through rather than lock out a neighbor
    public async Task A_US_or_unknown_address_can_post(string address)
    {
        await using var factory = WithCountryDatabase();
        var client = factory.CreateClient();

        var feeding = await client.SendAsync(EveryWrite(address).First(), Ct);
        var sighting = await client.SendAsync(EveryWrite(address).Skip(1).First(), Ct);

        Assert.Equal(HttpStatusCode.Created, feeding.StatusCode);
        Assert.Equal(HttpStatusCode.Created, sighting.StatusCode);
        Assert.True(await Allowed(client, address));
    }

    [Fact]
    public async Task Reading_stays_open_from_anywhere_and_says_posting_is_not()
    {
        await using var factory = WithCountryDatabase();
        var client = factory.CreateClient();

        foreach (var path in new[] { "/api/king/status", "/api/king/history", "/api/king/spots", "/api/king/heat?layer=seen" })
        {
            Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Request(HttpMethod.Get, path, Gb), Ct)).StatusCode);
        }
        Assert.False(await Allowed(client, Gb));
    }

    [Fact]
    public async Task An_IPv4_address_in_IPv6_form_is_looked_up_as_IPv4()
    {
        await using var factory = WithCountryDatabase();

        var response = await factory.Server.SendAsync(context =>
        {
            context.Request.Method = "GET";
            context.Request.Path = "/api/king/posting";
            context.Connection.RemoteIpAddress = IPAddress.Parse(Gb).MapToIPv6();
        }, Ct);

        Assert.Equal(StatusCodes.Status200OK, response.Response.StatusCode);
        var answer = await JsonSerializer.DeserializeAsync<JsonElement>(response.Response.Body, cancellationToken: Ct);
        Assert.False(answer.GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task Without_a_country_database_everyone_can_post()
    {
        await using var factory = new KingApiFactory(settings: [("King:Proxy:TrustForwardedFor", "true")]);
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Created, (await client.SendAsync(EveryWrite(Gb).First(), Ct)).StatusCode);
        Assert.True(await Allowed(client, Gb));
    }

    [Fact]
    public async Task A_configured_database_that_can_t_be_read_stops_the_server_starting()
    {
        await using var factory = WithCountryDatabase(Path.Combine(AppContext.BaseDirectory, "TestData", "missing.mmdb"));

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("King:Posting:CountryDatabase", error.ToString());
    }

    [Fact]
    public async Task Refusals_are_counted_without_the_country_or_address()
    {
        await using var factory = WithCountryDatabase();
        using var refused = new MetricCollector<long>(
            factory.Services.GetRequiredService<IMeterFactory>(), "KingOfWees", "king.posting.refused");
        var client = factory.CreateClient();

        await client.SendAsync(EveryWrite(Gb).First(), Ct);
        await client.SendAsync(EveryWrite(Us).First(), Ct);

        var measurement = Assert.Single(refused.GetMeasurementSnapshot());
        Assert.Empty(measurement.Tags);
    }
}
