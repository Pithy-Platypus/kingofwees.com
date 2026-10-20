namespace KingOfWees.Server.Photos;

/// <summary>Photo files (JPEG) by name; the database holds only the names.</summary>
public interface IPhotoBlobStore
{
    Task PutAsync(string name, Stream content, CancellationToken cancellationToken);

    /// <returns>The file's content, or null when no file has the name.</returns>
    Task<Stream?> OpenAsync(string name, CancellationToken cancellationToken);

    /// <returns>Whether a file with the name existed.</returns>
    Task<bool> DeleteAsync(string name, CancellationToken cancellationToken);

    /// <summary>Makes a first call, so the next ones don't wait for sign-in and a connection.</summary>
    Task WarmUpAsync(CancellationToken cancellationToken);
}
