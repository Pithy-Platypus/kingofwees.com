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
