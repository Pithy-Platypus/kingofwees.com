using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace KingOfWees.Server.Photos;

public sealed class AzurePhotoBlobStore(BlobContainerClient container) : IPhotoBlobStore
{
    private static readonly BlobUploadOptions Jpeg = new() { HttpHeaders = new BlobHttpHeaders { ContentType = "image/jpeg" } };

    public Task PutAsync(string name, Stream content, CancellationToken cancellationToken) =>
        container.GetBlobClient(name).UploadAsync(content, Jpeg, cancellationToken);

    public async Task<Stream?> OpenAsync(string name, CancellationToken cancellationToken)
    {
        try
        {
            var download = await container.GetBlobClient(name).DownloadStreamingAsync(cancellationToken: cancellationToken);
            return download.Value.Content;
        }
        catch (RequestFailedException e) when (e.Status == StatusCodes.Status404NotFound)
        {
            return null;
        }
    }

    // One page of at most one name: a 200 whether or not there are photos, with the app's own read access.
    public async Task WarmUpAsync(CancellationToken cancellationToken)
    {
        await foreach (var _ in container.GetBlobsAsync(cancellationToken: cancellationToken).AsPages(pageSizeHint: 1))
        {
            return;
        }
    }

    public async Task<bool> DeleteAsync(string name, CancellationToken cancellationToken) =>
        await container.GetBlobClient(name).DeleteIfExistsAsync(cancellationToken: cancellationToken);
}
