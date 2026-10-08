namespace KingOfWees.Server.King;

// Bound from "King:Map". The center is King's street, so it lives in user-secrets or the environment, never the repo.
public sealed class MapOptions
{
    public const string Section = "King:Map";

    public GeoPoint? Center { get; set; }
}

public sealed record MapView(GeoPoint Center);
