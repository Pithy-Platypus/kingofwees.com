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

// Every place for the admin's list; HiddenPoster marks one whose device is hidden. Never the device key.
public sealed record AdminSpotView(string Id, string Name, bool HiddenPoster);

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
            .MustAsync(async (request, name, ct) => !await spots.NameTakenAsync(name.Trim(), request.SpotId, ct))
            .WithErrorCode("name.taken");
    }
}
