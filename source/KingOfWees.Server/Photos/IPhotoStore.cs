namespace KingOfWees.Server.Photos;

// A photo on an entry (EventId) or shared on its own (no EventId). Its files are named after Id (PhotoFiles).
// ReporterKey is the per-device secret, as on entries; it is never returned by the API.
public sealed record Photo(
    string Id, string? EventId, DateTimeOffset PostedAt, string ReporterKey, string? ReporterName, PhotoHiding? Hiding = null);

public enum HideReason { NotKing, ShowsPerson, Rude, Unlawful, Other }

// Why and when an admin hid a photo, and the name they typed at sign-in (a claim, not proof). Admin-only: never public,
// logged or tagged. Null for a visible photo, and for one hidden before reasons existed.
public sealed record PhotoHiding(HideReason Reason, string? Note, DateTimeOffset At, string? AdminName);

/// <summary>
/// Photo records. Public reads leave out photos hidden one by one, photos from hidden devices and photos on hidden
/// entries. <see cref="FindAsync"/> and <see cref="FindByEventAsync"/> deliberately don't (undo, one photo per entry).
/// </summary>
public interface IPhotoStore
{
    Task AddAsync(Photo photo, CancellationToken cancellationToken);

    Task<Photo?> FindAsync(string id, CancellationToken cancellationToken);

    /// <summary>The entry's photo, hidden or not.</summary>
    Task<Photo?> FindByEventAsync(string eventId, CancellationToken cancellationToken);

    /// <summary>The photo if a visitor may see it, else null.</summary>
    Task<Photo?> FindVisibleAsync(string id, CancellationToken cancellationToken);

    /// <summary>Visible photos newest first, by time then id; <paramref name="before"/> (null = from the newest) is the last photo of the previous page.</summary>
    Task<IReadOnlyList<Photo>> GetPageAsync(Photo? before, int count, CancellationToken cancellationToken);

    /// <summary>The visible photos on these entries.</summary>
    Task<IReadOnlyList<Photo>> ForEventsAsync(IReadOnlyCollection<string> eventIds, CancellationToken cancellationToken);

    /// <summary>Hides one photo from every public read (admin), keeping why and by whom.</summary>
    /// <returns>True when the photo exists.</returns>
    Task<bool> HideAsync(string id, PhotoHiding hiding, CancellationToken cancellationToken);

    /// <summary>Shows a hidden photo again, forgetting why it was hidden (the audit log keeps that).</summary>
    /// <returns>True when the photo exists.</returns>
    Task<bool> ShowAsync(string id, CancellationToken cancellationToken);

    /// <summary>Photos hidden one by one (admin), newest first, whatever their device or entry.</summary>
    Task<IReadOnlyList<Photo>> GetHiddenAsync(CancellationToken cancellationToken);

    /// <returns>True when a photo was deleted.</returns>
    Task<bool> DeleteAsync(string id, CancellationToken cancellationToken);
}
