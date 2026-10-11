using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

public sealed class InMemoryPhotoBlobStoreTests : PhotoBlobStoreContract
{
    protected override IPhotoBlobStore CreateStore() => new InMemoryPhotoBlobStore();
}
