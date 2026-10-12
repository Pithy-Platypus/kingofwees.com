using KingOfWees.Server.Admin;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.King;

// Every IAdminLogStore implementation (real and test double) must pass these.
public abstract class AdminLogStoreContract
{
    protected static readonly DateTimeOffset T0 = new(2026, 10, 11, 12, 0, 0, TimeSpan.Zero);

    protected abstract IAdminLogStore CreateStore();

    protected static CancellationToken Ct => TestContext.Current.CancellationToken;

    protected static AdminLogRecord Record(string id, DateTimeOffset at, AdminAction action = AdminAction.SignIn) =>
        new(id, at, action, "Wallie", "203.0.113.7", new AdminTouched());

    [Fact]
    public async Task An_appended_record_comes_back_with_everything_it_touched()
    {
        var store = CreateStore();
        var record = new AdminLogRecord(
            "r1", T0, AdminAction.MergePlaces, "Wallie", "203.0.113.7",
            new AdminTouched("Sarah", 14, 2, KingEventKind.Fed, T0.AddHours(-3), "Porch", "Front porch", ["porch", "Steps"], 12, HideReason.Unlawful, "reported"));

        await store.AppendAsync(record, Ct);

        // Records holding lists compare the lists by reference, so compare structure instead.
        Assert.Equivalent(record, await store.FindAsync("r1", Ct), strict: true);
        Assert.Equivalent(new[] { record }, await store.GetPageAsync(before: null, 10, Ct), strict: true);
    }

    [Fact]
    public async Task A_record_with_no_name_address_or_details_comes_back_as_it_was()
    {
        var store = CreateStore();
        var record = new AdminLogRecord("r1", T0, AdminAction.SignInFailed, null, null, new AdminTouched());

        await store.AppendAsync(record, Ct);

        Assert.Equal(record, await store.FindAsync("r1", Ct));
    }

    [Fact]
    public async Task An_unknown_id_is_not_found()
    {
        var store = CreateStore();
        await store.AppendAsync(Record("r1", T0), Ct);

        Assert.Null(await store.FindAsync("nope", Ct));
    }

    [Fact]
    public async Task Pages_are_newest_first_and_never_skip_or_repeat_records_with_the_same_time()
    {
        var store = CreateStore();
        var oldest = Record("a", T0);
        var tieLow = Record("b", T0.AddMinutes(1));
        var tieHigh = Record("c", T0.AddMinutes(1));
        var newest = Record("d", T0.AddMinutes(2));
        foreach (var record in new[] { tieLow, newest, oldest, tieHigh }) await store.AppendAsync(record, Ct);

        var first = await store.GetPageAsync(before: null, 2, Ct);
        var second = await store.GetPageAsync(first[^1], 2, Ct);
        var last = await store.GetPageAsync(second[^1], 2, Ct);

        Assert.Equal([newest, tieHigh], first);
        Assert.Equal([tieLow, oldest], second);
        Assert.Empty(last);
    }
}
