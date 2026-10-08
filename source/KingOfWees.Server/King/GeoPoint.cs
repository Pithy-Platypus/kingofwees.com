using System.Text.Json.Serialization;

namespace KingOfWees.Server.King;

// Location privacy: every way of setting a coordinate (constructor, `with`, JSON, Mongo reads, configuration) rounds
// it to 3 decimals (~110 m, about a block), so no finer coordinate can reach storage. Why → docs/patterns/location-privacy.md.
public sealed record GeoPoint
{
    public const int Decimals = 3;

    public GeoPoint(double latitude, double longitude)
    {
        Latitude = latitude;
        Longitude = longitude;
    }

    // Required: JSON would otherwise read a missing coordinate as 0 — a real place, off the coast of Africa.
    [JsonRequired]
    public double Latitude { get; init => field = Round(value); }

    [JsonRequired]
    public double Longitude { get; init => field = Round(value); }

    // Away from zero at midpoints, matching the browser's roundToBlock.
    private static double Round(double coordinate) => Math.Round(coordinate, Decimals, MidpointRounding.AwayFromZero);
}
