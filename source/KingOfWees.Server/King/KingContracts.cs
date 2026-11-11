using FluentValidation;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Validation;

namespace KingOfWees.Server.King;

// SawKing omitted means he was seen: a feeding counts as a sighting unless the feeder only left food out.
// Clean* is what is validated and stored: the typed text without invisible characters (DisplayText).
public sealed record LogFeedingRequest(
    string ReporterKey, string? ReporterName, IReadOnlyList<Food>? Foods, bool? SawKing = null, string? SpotId = null)
{
    public string? CleanReporterName => DisplayText.Clean(ReporterName);
}

public sealed record LogSightingRequest(string ReporterKey, string? ReporterName, GeoPoint? Location = null)
{
    public string? CleanReporterName => DisplayText.Clean(ReporterName);
}

// Null (or omitted) clears the name, so the entry reads "a neighbor"; the device key travels in X-Reporter-Key, as for undo.
public sealed record RenameEventRequest(string? ReporterName)
{
    public string? CleanReporterName => DisplayText.Clean(ReporterName);
}

public sealed record AddSpotRequest(string ReporterKey, string Name, GeoPoint? Location)
{
    public string? CleanName => DisplayText.Clean(Name);
}

public sealed record SpotView(string Id, string Name, GeoPoint Location)
{
    public static SpotView From(Spot s) => new(s.Id, s.Name, s.Location);
}

// A feeding is shown at its spot (name and place); a sighting at its own location, if one was given.
// PhotoId is the entry's photo while a visitor may see it.
public sealed record EventView(
    string Id, KingEventKind Kind, DateTimeOffset OccurredAt, string? ReporterName, IReadOnlyList<Food> Foods, bool SawKing,
    string? SpotName, GeoPoint? Location, string? PhotoId = null)
{
    public static EventView From(KingEvent e, Spot? spot, string? photoId = null) =>
        new(e.Id, e.Kind, e.OccurredAt, e.ReporterName, e.Foods, e.SawKing, spot?.Name, spot?.Location ?? e.Location, photoId);
}

// Bound from the query string with [AsParameters]; Before is the id of the last event already shown.
public sealed record HistoryQuery(string? Before, int? Limit);

// Whether this visitor may post: false only for a known address outside the US (when the check is on).
public sealed record PostingView(bool Allowed);

public sealed record HistoryPage(IReadOnlyList<EventView> Events, string? Next);

// Layer is "seen" or "fed"; Days is one of Ranges, or omitted for all time.
public sealed record HeatQuery(string? Layer, int? Days)
{
    public const string Seen = "seen";
    public const string Fed = "fed";
    // The ranges the page's switch offers. The frontend's HeatRange (src/king/api.ts) is the same pair — change both.
    public static readonly int[] Ranges = [7, 30];
}

// SpotName is set on the fed layer, where each cell is one spot; seen cells are blocks.
public sealed record HeatCell(GeoPoint Location, int Count, string? SpotName);

public sealed record HeatMap(IReadOnlyList<HeatCell> Cells);

// What the habit charts need of an entry and nothing else: no name, place, id or photo travels with them.
public sealed record HabitEntry(DateTimeOffset OccurredAt, KingEventKind Kind, bool SawKing, IReadOnlyList<Food> Foods)
{
    public static HabitEntry From(KingEvent e) => new(e.OccurredAt, e.Kind, e.SawKing, e.Foods);
}

// Days is one of HeatQuery.Ranges, or omitted for all time: the court's range (the entries are always all-time, capped).
public sealed record HabitsQuery(int? Days);

// One seat at the royal court: a nickname (as neighbors typed it, so two devices with one name share a seat) and its feedings.
public sealed record CourtierView(string Name, int Feedings);

// Every visible entry, newest first, the newest MaxEntries at most (a decade at today's rate), and the court: the Seats
// named neighbors with most feedings among those entries, ties by name; unnamed feedings hold no seat.
public sealed record HabitsView(IReadOnlyList<HabitEntry> Entries, IReadOnlyList<CourtierView> Court)
{
    public const int MaxEntries = 5000;
    public const int Seats = 3;

    public static IReadOnlyList<CourtierView> CourtOf(IEnumerable<KingEvent> events, DateTimeOffset? since) =>
    [
        .. events.Where(e => e.Kind == KingEventKind.Fed && e.ReporterName is not null && (since is null || e.OccurredAt >= since))
            .GroupBy(e => e.ReporterName!, (name, feedings) => new CourtierView(name, feedings.Count()))
            .OrderByDescending(c => c.Feedings).ThenBy(c => c.Name, StringComparer.Ordinal)
            .Take(Seats),
    ];
}

// LatestPhoto is the newest visible photo of any kind (Home's crowned avatar).
public sealed record KingStatus(EventView? LastFed, EventView? LastSeen, IReadOnlyList<EventView> Recent, PhotoView? LatestPhoto);

// Error codes are what the client translates — never English sentences.
public sealed class LogFeedingRequestValidator : AbstractValidator<LogFeedingRequest>
{
    public LogFeedingRequestValidator(ISpotStore spots)
    {
        RuleFor(r => r.ReporterKey).ValidReporterKey();
        RuleFor(r => r.SpotId)
            .MustAsync(async (id, ct) => await spots.FindAsync(id!, ct) is not null)
            .When(r => r.SpotId is not null)
            .WithErrorCode("spotId.unknown");
        RuleFor(r => r.CleanReporterName).ValidReporterName().OverridePropertyName(nameof(LogFeedingRequest.ReporterName));
        RuleForEach(r => r.Foods).IsInEnum().WithErrorCode("food.invalid");
        RuleFor(r => r.Foods)
            .Must(foods => foods is null || foods.Distinct().Count() == foods.Count)
            .WithErrorCode("foods.duplicate");
    }
}

public sealed class LogSightingRequestValidator : AbstractValidator<LogSightingRequest>
{
    public LogSightingRequestValidator()
    {
        RuleFor(r => r.ReporterKey).ValidReporterKey();
        RuleFor(r => r.CleanReporterName).ValidReporterName().OverridePropertyName(nameof(LogSightingRequest.ReporterName));
        RuleFor(r => r.Location).ValidLocation();
    }
}

public sealed class RenameEventRequestValidator : AbstractValidator<RenameEventRequest>
{
    public RenameEventRequestValidator() =>
        RuleFor(r => r.CleanReporterName).ValidReporterName().OverridePropertyName(nameof(RenameEventRequest.ReporterName));
}

public sealed class AddSpotRequestValidator : AbstractValidator<AddSpotRequest>
{
    public const int MaxNameLength = 40;

    public AddSpotRequestValidator()
    {
        RuleFor(r => r.ReporterKey).ValidReporterKey();
        RuleFor(r => r.CleanName)
            .NotEmpty().WithErrorCode("name.required")
            .MaximumLength(MaxNameLength).WithErrorCode("name.tooLong")
            .OverridePropertyName(nameof(AddSpotRequest.Name));
        RuleFor(r => r.Location).NotNull().WithErrorCode("location.required").ValidLocation();
    }
}

public sealed class HistoryQueryValidator : AbstractValidator<HistoryQuery>
{
    public HistoryQueryValidator(IKingEventStore store)
    {
        RuleFor(q => q.Limit).ValidLimit();
        RuleFor(q => q.Before).KnownCursor(store.FindAsync);
    }
}

public sealed class HabitsQueryValidator : AbstractValidator<HabitsQuery>
{
    public HabitsQueryValidator() => RuleFor(q => q.Days).ValidDays();
}

public sealed class HeatQueryValidator : AbstractValidator<HeatQuery>
{
    public HeatQueryValidator()
    {
        RuleFor(q => q.Layer).Must(l => l is HeatQuery.Seen or HeatQuery.Fed).WithErrorCode("layer.invalid");
        RuleFor(q => q.Days).ValidDays();
    }
}

internal static class QueryRules
{
    /// <summary>One of <see cref="HeatQuery.Ranges"/>, or omitted for all time.</summary>
    public static IRuleBuilderOptions<T, int?> ValidDays<T>(this IRuleBuilder<T, int?> rule) =>
        rule.Must(d => d is null || HeatQuery.Ranges.Contains(d.Value)).WithErrorCode("days.invalid");
}

internal static class ReporterRules
{
    public const int MaxNameLength = 40;
    public const int MaxKeyLength = 64;

    public static IRuleBuilderOptions<T, string> ValidReporterKey<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithErrorCode("reporterKey.required")
            .MaximumLength(MaxKeyLength).WithErrorCode("reporterKey.tooLong");

    public static IRuleBuilderOptions<T, string?> ValidReporterName<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(MaxNameLength).WithErrorCode("reporterName.tooLong");

    public static IRuleBuilderOptions<T, GeoPoint?> ValidLocation<T>(this IRuleBuilder<T, GeoPoint?> rule) =>
        rule.Must(p => p is null || (Math.Abs(p.Latitude) <= 90 && Math.Abs(p.Longitude) <= 180))
            .WithErrorCode("location.outOfRange");
}
