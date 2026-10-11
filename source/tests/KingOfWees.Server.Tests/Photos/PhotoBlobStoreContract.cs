using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

// Every IPhotoBlobStore implementation (real and test double) must pass these.
public abstract class PhotoBlobStoreContract
{
    protected abstract IPhotoBlobStore CreateStore();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewName() => $"{Guid.CreateVersion7()}.jpg";

    private static async Task<byte[]> ReadAll(Stream stream)
    {
        await using (stream)
        {
            using var copy = new MemoryStream();
            await stream.CopyToAsync(copy, Ct);
            return copy.ToArray();
        }
    }

    [Fact]
    public async Task A_stored_file_opens_with_the_same_bytes()
    {
        var store = CreateStore();
        var name = NewName();
        byte[] bytes = [0xFF, 0xD8, 1, 2, 3, 0xFF, 0xD9];

        await store.PutAsync(name, new MemoryStream(bytes), Ct);

        Assert.Equal(bytes, await ReadAll((await store.OpenAsync(name, Ct))!));
    }

    [Fact]
    public async Task Each_name_keeps_its_own_file()
    {
        var store = CreateStore();
        var (first, second) = (NewName(), NewName());

        await store.PutAsync(first, new MemoryStream([1]), Ct);
        await store.PutAsync(second, new MemoryStream([2]), Ct);

        Assert.Equal([1], await ReadAll((await store.OpenAsync(first, Ct))!));
        Assert.Equal([2], await ReadAll((await store.OpenAsync(second, Ct))!));
    }

    [Fact]
    public async Task Opening_an_unknown_name_gives_null()
    {
        var store = CreateStore();
        await store.PutAsync(NewName(), new MemoryStream([1]), Ct);

        Assert.Null(await store.OpenAsync(NewName(), Ct));
    }

    [Fact]
    public async Task Delete_removes_the_file_and_reports_whether_it_existed()
    {
        var store = CreateStore();
        var (deleted, kept) = (NewName(), NewName());
        await store.PutAsync(deleted, new MemoryStream([1]), Ct);
        await store.PutAsync(kept, new MemoryStream([2]), Ct);

        Assert.True(await store.DeleteAsync(deleted, Ct));
        Assert.False(await store.DeleteAsync(deleted, Ct));
        Assert.Null(await store.OpenAsync(deleted, Ct));
        Assert.NotNull(await store.OpenAsync(kept, Ct));
    }
}
