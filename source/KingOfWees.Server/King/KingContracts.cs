using FluentValidation;

namespace KingOfWees.Server.King;

// SawKing omitted means he was seen: a feeding counts as a sighting unless the feeder only left food out.
public sealed record LogFeedingRequest(
    string ReporterKey, string? ReporterName, IReadOnlyList<Food>? Foods, bool? SawKing = null, string? SpotId = null);

public sealed record LogSightingRequest(string ReporterKey, string? ReporterName, GeoPoint? Location = null);

public sealed record AddSpotRequest(string ReporterKey, string Name, GeoPoint? Location);

public sealed record SpotView(string Id, string Name, GeoPoint Location)
{
    public static SpotView From(Spot s) => new(s.Id, s.Name, s.Location);
}

// A feeding is shown at its spot (name and place); a sighting at its own location, if one was given.
public sealed record EventView(
    string Id, KingEventKind Kind, DateTimeOffset OccurredAt, string? ReporterName, IReadOnlyList<Food> Foods, bool SawKing,
    string? SpotName, GeoPoint? Location)
{
    public static EventView From(KingEvent e, Spot? spot) =>
        new(e.Id, e.Kind, e.OccurredAt, e.ReporterName, e.Foods, e.SawKing, spot?.Name, spot?.Location ?? e.Location);
}

public sealed record KingStatus(EventView? LastFed, EventView? LastSeen, IReadOnlyList<EventView> Recent);

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
        RuleFor(r => r.ReporterName).ValidReporterName();
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
        RuleFor(r => r.ReporterName).ValidReporterName();
        RuleFor(r => r.Location).ValidLocation();
    }
}

public sealed class AddSpotRequestValidator : AbstractValidator<AddSpotRequest>
{
    public const int MaxNameLength = 40;

    public AddSpotRequestValidator()
    {
        RuleFor(r => r.ReporterKey).ValidReporterKey();
        RuleFor(r => r.Name)
            .NotEmpty().WithErrorCode("name.required")
            .MaximumLength(MaxNameLength).WithErrorCode("name.tooLong");
        RuleFor(r => r.Location).NotNull().WithErrorCode("location.required").ValidLocation();
    }
}

internal static class ReporterRules
{
    public static IRuleBuilderOptions<T, string> ValidReporterKey<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithErrorCode("reporterKey.required")
            .MaximumLength(64).WithErrorCode("reporterKey.tooLong");

    public static IRuleBuilderOptions<T, string?> ValidReporterName<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(40).WithErrorCode("reporterName.tooLong");

    public static IRuleBuilderOptions<T, GeoPoint?> ValidLocation<T>(this IRuleBuilder<T, GeoPoint?> rule) =>
        rule.Must(p => p is null || (Math.Abs(p.Latitude) <= 90 && Math.Abs(p.Longitude) <= 180))
            .WithErrorCode("location.outOfRange");
}
