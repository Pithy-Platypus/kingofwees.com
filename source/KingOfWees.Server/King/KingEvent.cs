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
public sealed record KingEvent(
    string Id,
    KingEventKind Kind,
    DateTimeOffset OccurredAt,
    string ReporterKey,
    string? ReporterName,
    IReadOnlyList<Food> Foods);
