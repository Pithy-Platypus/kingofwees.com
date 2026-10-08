using System.Net;
using System.Text.Json;

namespace KingOfWees.Server.Tests.Api;

// The map's center is King's street: it comes from configuration (user-secrets, environment), never the repo.
public sealed class MapConfigTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task The_configured_center_is_served_rounded()
    {
        await using var factory = new KingApiFactory(
            settings: [("King:Map:Center:Latitude", "45.523456"), ("King:Map:Center:Longitude", "-122.676543")]);

        var response = await factory.CreateClient().GetAsync("/api/king/map", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var center = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.GetProperty("center");
        Assert.Equal(45.523, center.GetProperty("latitude").GetDouble());
        Assert.Equal(-122.677, center.GetProperty("longitude").GetDouble());
    }

    [Fact]
    public async Task Without_a_configured_center_there_is_no_map()
    {
        await using var factory = new KingApiFactory();

        var response = await factory.CreateClient().GetAsync("/api/king/map", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
