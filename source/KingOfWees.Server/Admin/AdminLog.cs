using KingOfWees.Server.King;

namespace KingOfWees.Server.Admin;

public enum AdminAction { SignIn, SignInFailed, HideEntry, ShowEntry, HidePoster, RestorePoster, RenamePlace, MergePlaces, HidePhoto, ShowPhoto }

// What an admin action touched, in words a reader recognises: names and counts, never a device key.
public sealed record AdminTouched(
    string? PosterName = null,
    int? Entries = null,
    int? Spots = null,
    KingEventKind? EntryKind = null,
    DateTimeOffset? EntryAt = null,
    string? PlaceName = null,
    string? NewName = null,
    IReadOnlyList<string>? MergedNames = null,
    int? Feedings = null);

// One line of the audit log. AdminName is what was typed at sign-in: with one shared key it's a claim, not proof.
public sealed record AdminLogRecord(
    string Id, DateTimeOffset At, AdminAction Action, string? AdminName, string? Address, AdminTouched Touched);

// Append-only: there is deliberately no way to change or delete a record. The database drops them after a year.
public interface IAdminLogStore
{
    Task AppendAsync(AdminLogRecord record, CancellationToken cancellationToken);

    Task<AdminLogRecord?> FindAsync(string id, CancellationToken cancellationToken);

    /// <summary>Newest first, by time then id; <paramref name="before"/> (null = from the newest) is the last record of the previous page.</summary>
    Task<IReadOnlyList<AdminLogRecord>> GetPageAsync(AdminLogRecord? before, int count, CancellationToken cancellationToken);
}
