namespace KingOfWees.Server.King;

/// <summary>How many events fell in one rounded block.</summary>
public sealed record PlaceCount(GeoPoint Place, int Count);

/// <summary>How many feedings happened at one spot.</summary>
public sealed record SpotCount(string SpotId, int Count);
