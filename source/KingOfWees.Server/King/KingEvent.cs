namespace KingOfWees.Server.King;

public enum KingEventKind
{
    Fed,
    Seen,
}

public enum Food
{
    Wet,
    Dry,
    Treats,
}

// ReporterKey is a per-device secret that proves ownership (undo); it is never returned by the API.
// SawKing is false only for a feeding where the food was left out; it decides whether the event counts as a sighting.
public sealed record KingEvent(
    string Id,
    KingEventKind Kind,
    DateTimeOffset OccurredAt,
    string ReporterKey,
    string? ReporterName,
    IReadOnlyList<Food> Foods,
    bool SawKing,
    string? SpotId,
    GeoPoint? Location);
