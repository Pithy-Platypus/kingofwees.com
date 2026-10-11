using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

public sealed class AzurePhotoBlobStoreTests(BlobAppFixture blobs)
    : PhotoBlobStoreContract, IClassFixture<BlobAppFixture>
{
    protected override IPhotoBlobStore CreateStore() => new AzurePhotoBlobStore(blobs.NewContainer());
}
