using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Every IHiddenReporterStore implementation (real and test double) must pass these.
public abstract class HiddenReporterStoreContract
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    protected abstract IHiddenReporterStore CreateStore();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_hidden_device_is_listed_with_when_it_was_hidden()
    {
        var store = CreateStore();

        var record = await store.HideAsync("spammer", T0, Ct);

        Assert.Equal(new HiddenReporter(record.Id, "spammer", T0), record);
        Assert.Equal([record], await store.ListAsync(Ct));
    }

    [Fact]
    public async Task Hiding_a_device_again_keeps_the_first_record()
    {
        var store = CreateStore();
        var first = await store.HideAsync("spammer", T0, Ct);

        var again = await store.HideAsync("spammer", T0.AddMinutes(5), Ct);

        Assert.Equal(first, again);
        Assert.Equal([first], await store.ListAsync(Ct));
    }

    [Fact]
    public async Task List_is_newest_hidden_first()
    {
        var store = CreateStore();
        var older = await store.HideAsync("spammer-1", T0, Ct);
        var newer = await store.HideAsync("spammer-2", T0.AddMinutes(1), Ct);

        Assert.Equal([newer, older], await store.ListAsync(Ct));
    }

    [Fact]
    public async Task Restore_removes_the_record_and_reports_whether_it_existed()
    {
        var store = CreateStore();
        var record = await store.HideAsync("spammer", T0, Ct);
        var kept = await store.HideAsync("other", T0, Ct);

        Assert.True(await store.RestoreAsync(record.Id, Ct));
        Assert.False(await store.RestoreAsync(record.Id, Ct));
        Assert.Equal([kept], await store.ListAsync(Ct));
    }
}
