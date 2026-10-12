namespace KingOfWees.Server.Photos;

// A photo on an entry (EventId) or shared on its own (no EventId). Its files are named after Id (PhotoFiles).
// ReporterKey is the per-device secret, as on entries; it is never returned by the API.
public sealed record Photo(string Id, string? EventId, DateTimeOffset PostedAt, string ReporterKey, string? ReporterName);

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

    /// <summary>Hides one photo from every public read (admin), or shows it again.</summary>
    /// <returns>True when the photo exists.</returns>
    Task<bool> SetHiddenAsync(string id, bool hidden, CancellationToken cancellationToken);

    /// <summary>Photos hidden one by one (admin), newest first, whatever their device or entry.</summary>
    Task<IReadOnlyList<Photo>> GetHiddenAsync(CancellationToken cancellationToken);

    /// <returns>True when a photo was deleted.</returns>
    Task<bool> DeleteAsync(string id, CancellationToken cancellationToken);
}
