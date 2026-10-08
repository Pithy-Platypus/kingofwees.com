using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Location privacy: no coordinate finer than ~a block exists anywhere in the domain.
public sealed class GeoPointTests
{
    [Theory]
    [InlineData(45.523456, -122.676543, 45.523, -122.677)]
    [InlineData(45.5235, -122.6765, 45.524, -122.677)]
    [InlineData(-33.86882, 151.20929, -33.869, 151.209)]
    [InlineData(0.0004, -0.0004, 0, 0)]
    public void Rounds_both_coordinates_to_three_decimals_when_created(
        double latitude, double longitude, double expectedLatitude, double expectedLongitude)
    {
        var point = new GeoPoint(latitude, longitude);

        Assert.Equal(expectedLatitude, point.Latitude);
        Assert.Equal(expectedLongitude, point.Longitude);
    }

    [Fact]
    public void Rounding_a_point_the_browser_already_rounded_changes_nothing()
    {
        var once = new GeoPoint(45.523, -122.677);

        Assert.Equal(once, new GeoPoint(once.Latitude, once.Longitude));
    }

    [Fact]
    public void A_copy_with_a_new_coordinate_is_rounded_too()
    {
        var moved = new GeoPoint(45.523, -122.677) with { Latitude = 45.5249999 };

        Assert.Equal(45.525, moved.Latitude);
    }

    [Fact]
    public void A_point_bound_from_JSON_is_rounded()
    {
        var point = System.Text.Json.JsonSerializer.Deserialize<GeoPoint>(
            """{ "latitude": 45.523456, "longitude": -122.676543 }""",
            System.Text.Json.JsonSerializerOptions.Web);

        Assert.Equal(new GeoPoint(45.523, -122.677), point);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{ "latitude": 45.5 }""")]
    [InlineData("""{ "longitude": -122.6 }""")]
    public void A_point_missing_a_coordinate_is_rejected_rather_than_read_as_zero(string json) =>
        Assert.Throws<System.Text.Json.JsonException>(() =>
            System.Text.Json.JsonSerializer.Deserialize<GeoPoint>(json, System.Text.Json.JsonSerializerOptions.Web));
}
