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

    // Nothing to see through the interface: Azure lists one page, the double counts; only that neither throws.
    [Fact]
    public async Task Warming_up_does_not_throw_with_or_without_files()
    {
        var store = CreateStore();

        await store.WarmUpAsync(Ct);
        await store.PutAsync(NewName(), new MemoryStream([0xFF, 0xD8, 0xFF, 0xD9]), Ct);
        await store.WarmUpAsync(Ct);
    }

    [Fact]
    public async Task A_stored_file_opens_with_the_same_bytes()
    {
        var store = CreateStore();
        var name = NewName();
        byte[] bytes = [0xFF, 0xD8, 1, 2, 3, 0xFF, 0xD9];

        await store.PutAsync(name, new MemoryStream(bytes), Ct);

        Assert.Equal(bytes, await ReadAll((await store.OpenAsync(name, Ct))!.Content));
    }

    [Fact]
    public async Task A_file_carries_a_strong_tag_and_a_time_that_change_when_it_is_replaced()
    {
        // What the browser revalidates against: the same file answers the same tag, a replaced one another.
        var store = CreateStore();
        var name = NewName();
        await store.PutAsync(name, new MemoryStream([1]), Ct);

        var first = (await store.OpenAsync(name, Ct))!;
        var same = (await store.OpenAsync(name, Ct))!;
        await Task.Delay(TimeSpan.FromSeconds(1.1), Ct); // Last-Modified is whole seconds
        await store.PutAsync(name, new MemoryStream([2]), Ct);
        var replaced = (await store.OpenAsync(name, Ct))!;

        Assert.Matches("^\"[^\"]+\"$", first.ETag); // quoted, not weak: the browser sends it back as is
        Assert.Equal(first.ETag, same.ETag);
        Assert.Equal(first.LastModified, same.LastModified);
        Assert.NotEqual(first.ETag, replaced.ETag);
        Assert.True(replaced.LastModified > first.LastModified);
        Assert.InRange(first.LastModified, DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddMinutes(5));
        foreach (var file in new[] { first, same, replaced }) await file.Content.DisposeAsync();
    }

    [Fact]
    public async Task Each_name_keeps_its_own_file()
    {
        var store = CreateStore();
        var (first, second) = (NewName(), NewName());

        await store.PutAsync(first, new MemoryStream([1]), Ct);
        await store.PutAsync(second, new MemoryStream([2]), Ct);

        Assert.Equal([1], await ReadAll((await store.OpenAsync(first, Ct))!.Content));
        Assert.Equal([2], await ReadAll((await store.OpenAsync(second, Ct))!.Content));
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
