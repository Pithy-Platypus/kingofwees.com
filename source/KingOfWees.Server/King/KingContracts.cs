using FluentValidation;

namespace KingOfWees.Server.King;

public sealed record LogFeedingRequest(string ReporterKey, string? ReporterName, IReadOnlyList<Food>? Foods);

public sealed record LogSightingRequest(string ReporterKey, string? ReporterName);

public sealed record EventView(string Id, KingEventKind Kind, DateTimeOffset OccurredAt, string? ReporterName, IReadOnlyList<Food> Foods)
{
    public static EventView From(KingEvent e) => new(e.Id, e.Kind, e.OccurredAt, e.ReporterName, e.Foods);
}

public sealed record KingStatus(EventView? LastFed, EventView? LastSeen, IReadOnlyList<EventView> Recent);

// Error codes are what the client translates — never English sentences.
public sealed class LogFeedingRequestValidator : AbstractValidator<LogFeedingRequest>
{
    public LogFeedingRequestValidator()
    {
        RuleFor(r => r.ReporterKey).ValidReporterKey();
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
    }
}

internal static class ReporterRules
{
    public static IRuleBuilderOptions<T, string> ValidReporterKey<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithErrorCode("reporterKey.required")
            .MaximumLength(64).WithErrorCode("reporterKey.tooLong");

    public static IRuleBuilderOptions<T, string?> ValidReporterName<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(40).WithErrorCode("reporterName.tooLong");
}
