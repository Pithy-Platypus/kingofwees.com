namespace KingOfWees.Server.King;

// A named place where neighbors feed King. Anyone can add one; ReporterKey (never returned) records which device did.
public sealed record Spot(string Id, string Name, GeoPoint Location, DateTimeOffset CreatedAt, string ReporterKey);
