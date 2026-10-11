using FluentValidation;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Admin;

// What an admin sees about a device: counts and the name on its newest entry, never its key.
public sealed record DeviceView(int Entries, int Spots, string? ReporterName, DateTimeOffset? NewestAt)
{
    public static DeviceView From(ReporterSummary summary, int spots) =>
        new(summary.Entries, spots, summary.LatestName, summary.NewestAt);
}

// Id is the hidden-device record's own id: what the admin restores by.
public sealed record HiddenDeviceView(
    string Id, DateTimeOffset HiddenAt, int Entries, int Spots, string? ReporterName, DateTimeOffset? NewestAt);

// Every place for the admin's list; HiddenPoster marks one whose device is hidden; Feedings counts every feeding there,
// hidden ones too (they move in a merge). Never the device key.
public sealed record AdminSpotView(string Id, string Name, bool HiddenPoster, int Feedings);

// The spot's id travels in the body so the validator can tell "taken by another place" from "this place's own name".
public sealed record RenameSpotRequest(string SpotId, string Name);

public sealed class RenameSpotRequestValidator : AbstractValidator<RenameSpotRequest>
{
    public RenameSpotRequestValidator(ISpotStore spots)
    {
        RuleFor(r => r.SpotId)
            .MustAsync(async (id, ct) => await spots.FindAsync(id, ct) is not null)
            .WithErrorCode("spotId.unknown");
        RuleFor(r => r.Name)
            .NotEmpty().WithErrorCode("name.required")
            .MaximumLength(AddSpotRequestValidator.MaxNameLength).WithErrorCode("name.tooLong")
            .MustAsync(async (request, name, ct) => !await spots.NameTakenAsync(name.Trim(), [request.SpotId], ct))
            .WithErrorCode("name.taken");
    }
}

// Merge MergeIds into KeepId (its pin stays); Name, when given, renames the kept place.
public sealed record MergeSpotsRequest(string KeepId, IReadOnlyList<string> MergeIds, string? Name);

// Name rules as for renaming, except the merged places' own names don't count as taken ("Porch" + "porch" → "Porch").
public sealed class MergeSpotsRequestValidator : AbstractValidator<MergeSpotsRequest>
{
    public MergeSpotsRequestValidator(ISpotStore spots)
    {
        RuleFor(r => r.KeepId)
            .MustAsync(async (id, ct) => await spots.FindAsync(id, ct) is not null)
            .WithErrorCode("keepId.unknown");
        RuleFor(r => r.MergeIds)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithErrorCode("mergeIds.required")
            .Must((r, ids) => ids.Distinct().Count() == ids.Count && !ids.Contains(r.KeepId)).WithErrorCode("mergeIds.invalid")
            .MustAsync(async (ids, ct) =>
            {
                foreach (var id in ids)
                {
                    if (await spots.FindAsync(id, ct) is null) return false;
                }
                return true;
            })
            .WithErrorCode("mergeIds.unknown");
        RuleFor(r => r.Name!)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithErrorCode("name.required")
            .MaximumLength(AddSpotRequestValidator.MaxNameLength).WithErrorCode("name.tooLong")
            .MustAsync(async (request, name, ct) =>
                !await spots.NameTakenAsync(name.Trim(), [request.KeepId, .. request.MergeIds ?? []], ct))
            .WithErrorCode("name.taken")
            .When(r => r.Name is not null);
    }
}

// Bound from the query string with [AsParameters]; Before is the id of the last record already shown.
public sealed record ActivityQuery(string? Before, int? Limit);

public sealed record ActivityPage(IReadOnlyList<AdminLogRecord> Records, string? Next);

public sealed class ActivityQueryValidator : AbstractValidator<ActivityQuery>
{
    public ActivityQueryValidator(IAdminLogStore log)
    {
        RuleFor(q => q.Limit).InclusiveBetween(1, HistoryQuery.MaxLimit).WithErrorCode("limit.outOfRange");
        RuleFor(q => q.Before)
            .MustAsync(async (id, ct) => await log.FindAsync(id!, ct) is not null)
            .When(q => q.Before is not null)
            .WithErrorCode("before.unknown");
    }
}
