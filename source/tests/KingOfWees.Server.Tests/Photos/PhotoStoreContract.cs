using KingOfWees.Server.King;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

// Every IPhotoStore implementation (real and test double) must pass these.
public abstract class PhotoStoreContract
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    // All three share state: photos leave out what the hidden-reporter and event stores hide.
    protected abstract (IPhotoStore Photos, IKingEventStore Events, IHiddenReporterStore Hidden) CreateStores();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Photo NewPhoto(int minutesAfterT0, string? eventId = null, string device = "device-key-1") =>
        new(Guid.CreateVersion7().ToString(), eventId, T0.AddMinutes(minutesAfterT0), device, "Sarah");

    private static KingEvent NewSighting(string device = "device-key-1") =>
        new(Guid.CreateVersion7().ToString(), KingEventKind.Seen, T0, device, "Sarah", [], true, null, null);

    private static async Task<IReadOnlyList<Photo>> FirstPage(IPhotoStore photos) => await photos.GetPageAsync(null, 50, Ct);

    [Fact]
    public async Task Added_photos_are_found_by_id_with_every_field_intact()
    {
        var (photos, _, _) = CreateStores();
        var shared = NewPhoto(0) with { ReporterName = null };
        var onEntry = NewPhoto(1, eventId: "event-1");

        await photos.AddAsync(shared, Ct);
        await photos.AddAsync(onEntry, Ct);

        Assert.Equal(shared, await photos.FindAsync(shared.Id, Ct));
        Assert.Equal(onEntry, await photos.FindAsync(onEntry.Id, Ct));
        Assert.Null(await photos.FindAsync(Guid.CreateVersion7().ToString(), Ct));
    }

    [Fact]
    public async Task Pages_are_newest_first_and_ties_never_skip_or_repeat()
    {
        var (photos, _, _) = CreateStores();
        var oldest = NewPhoto(0);
        var tied = Enumerable.Range(0, 3).Select(_ => NewPhoto(5)).ToList();
        var newest = NewPhoto(10);
        foreach (var photo in tied.Prepend(oldest).Append(newest)) await photos.AddAsync(photo, Ct);

        var first = await photos.GetPageAsync(null, 2, Ct);
        var second = await photos.GetPageAsync(first[^1], 2, Ct);
        var third = await photos.GetPageAsync(second[^1], 2, Ct);

        var tiedNewestFirst = tied.OrderByDescending(p => p.Id, StringComparer.Ordinal).ToList();
        Assert.Equal([newest, .. tiedNewestFirst, oldest], [.. first, .. second, .. third]);
    }

    [Fact]
    public async Task A_hidden_photo_leaves_public_reads_until_shown_again()
    {
        var (photos, _, _) = CreateStores();
        var hidden = NewPhoto(0, eventId: "event-1");
        var kept = NewPhoto(1);
        await photos.AddAsync(hidden, Ct);
        await photos.AddAsync(kept, Ct);

        Assert.True(await photos.SetHiddenAsync(hidden.Id, true, Ct));

        Assert.Equal([kept], await FirstPage(photos));
        Assert.Null(await photos.FindVisibleAsync(hidden.Id, Ct));
        Assert.Empty(await photos.ForEventsAsync(["event-1"], Ct));
        Assert.Equal(hidden, await photos.FindAsync(hidden.Id, Ct));
        Assert.Equal(hidden, await photos.FindByEventAsync("event-1", Ct));

        Assert.True(await photos.SetHiddenAsync(hidden.Id, false, Ct));
        Assert.Equal([kept, hidden], await FirstPage(photos));
        Assert.Equal(hidden, await photos.FindVisibleAsync(hidden.Id, Ct));
    }

    [Fact]
    public async Task Hiding_an_unknown_photo_reports_false()
    {
        var (photos, _, _) = CreateStores();

        Assert.False(await photos.SetHiddenAsync(Guid.CreateVersion7().ToString(), true, Ct));
    }

    [Fact]
    public async Task Photos_from_a_hidden_device_leave_public_reads_even_ones_posted_later()
    {
        var (photos, _, hidden) = CreateStores();
        var before = NewPhoto(0, device: "spammer");
        var kept = NewPhoto(1);
        await photos.AddAsync(before, Ct);
        await photos.AddAsync(kept, Ct);
        await hidden.HideAsync("spammer", T0, Ct);
        var after = NewPhoto(2, eventId: "event-1", device: "spammer");
        await photos.AddAsync(after, Ct);

        Assert.Equal([kept], await FirstPage(photos));
        Assert.Null(await photos.FindVisibleAsync(before.Id, Ct));
        Assert.Empty(await photos.ForEventsAsync(["event-1"], Ct));
    }

    [Fact]
    public async Task A_photo_on_a_hidden_entry_leaves_public_reads_and_comes_back_with_it()
    {
        var (photos, events, _) = CreateStores();
        var entry = NewSighting();
        await events.AddAsync(entry, Ct);
        var onEntry = NewPhoto(0, eventId: entry.Id);
        var shared = NewPhoto(1);
        await photos.AddAsync(onEntry, Ct);
        await photos.AddAsync(shared, Ct);

        await events.SetHiddenAsync(entry.Id, true, Ct);

        Assert.Equal([shared], await FirstPage(photos));
        Assert.Null(await photos.FindVisibleAsync(onEntry.Id, Ct));
        Assert.Empty(await photos.ForEventsAsync([entry.Id], Ct));

        await events.SetHiddenAsync(entry.Id, false, Ct);
        Assert.Equal([shared, onEntry], await FirstPage(photos));
    }

    [Fact]
    public async Task For_events_gives_only_the_photos_on_those_entries()
    {
        var (photos, _, _) = CreateStores();
        var first = NewPhoto(0, eventId: "event-1");
        var second = NewPhoto(1, eventId: "event-2");
        await photos.AddAsync(first, Ct);
        await photos.AddAsync(second, Ct);
        await photos.AddAsync(NewPhoto(2, eventId: "event-3"), Ct);
        await photos.AddAsync(NewPhoto(3), Ct);

        var found = await photos.ForEventsAsync(["event-1", "event-2", "event-unknown"], Ct);

        Assert.Equal([first, second], found.OrderBy(p => p.PostedAt));
    }

    [Fact]
    public async Task Find_by_event_gives_the_entry_s_photo_or_null()
    {
        var (photos, _, _) = CreateStores();
        var onEntry = NewPhoto(0, eventId: "event-1");
        await photos.AddAsync(onEntry, Ct);
        await photos.AddAsync(NewPhoto(1), Ct);

        Assert.Equal(onEntry, await photos.FindByEventAsync("event-1", Ct));
        Assert.Null(await photos.FindByEventAsync("event-2", Ct));
    }

    [Fact]
    public async Task Delete_removes_the_photo_and_reports_whether_it_existed()
    {
        var (photos, _, _) = CreateStores();
        var deleted = NewPhoto(0);
        var kept = NewPhoto(1);
        await photos.AddAsync(deleted, Ct);
        await photos.AddAsync(kept, Ct);

        Assert.True(await photos.DeleteAsync(deleted.Id, Ct));
        Assert.False(await photos.DeleteAsync(deleted.Id, Ct));
        Assert.Null(await photos.FindAsync(deleted.Id, Ct));
        Assert.Equal([kept], await FirstPage(photos));
    }
}
