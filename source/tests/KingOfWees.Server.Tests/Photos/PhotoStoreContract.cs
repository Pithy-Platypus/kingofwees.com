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

    private static PhotoHiding Because(HideReason reason = HideReason.NotKing, string? note = null) =>
        new(reason, note, T0.AddDays(1), "Wallie");

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

        Assert.True(await photos.HideAsync(hidden.Id, Because(), Ct));

        Assert.Equal([kept], await FirstPage(photos));
        Assert.Null(await photos.FindVisibleAsync(hidden.Id, Ct));
        Assert.Empty(await photos.ForEventsAsync(["event-1"], Ct));
        Assert.Equal(hidden with { Hiding = Because() }, await photos.FindAsync(hidden.Id, Ct));
        Assert.Equal(hidden with { Hiding = Because() }, await photos.FindByEventAsync("event-1", Ct));

        Assert.True(await photos.ShowAsync(hidden.Id, Ct));
        Assert.Equal([kept, hidden], await FirstPage(photos));
        Assert.Equal(hidden, await photos.FindVisibleAsync(hidden.Id, Ct));
    }

    [Fact]
    public async Task The_hidden_list_has_photos_hidden_one_by_one_newest_first_whatever_their_device()
    {
        var (photos, _, hidden) = CreateStores();
        var older = NewPhoto(0, device: "spammer");
        var newer = NewPhoto(1, eventId: "event-1");
        var shownAgain = NewPhoto(2);
        var fromHiddenDevice = NewPhoto(3, device: "spammer");
        foreach (var photo in new[] { older, newer, shownAgain, fromHiddenDevice }) await photos.AddAsync(photo, Ct);
        await photos.HideAsync(older.Id, Because(), Ct);
        await photos.HideAsync(newer.Id, Because(), Ct);
        await photos.HideAsync(shownAgain.Id, Because(), Ct);
        await photos.ShowAsync(shownAgain.Id, Ct);
        await hidden.HideAsync("spammer", T0, Ct);

        Assert.Equal([newer with { Hiding = Because() }, older with { Hiding = Because() }], await photos.GetHiddenAsync(Ct));
    }

    [Fact]
    public async Task Hiding_or_showing_an_unknown_photo_reports_false()
    {
        var (photos, _, _) = CreateStores();

        Assert.False(await photos.HideAsync(Guid.CreateVersion7().ToString(), Because(), Ct));
        Assert.False(await photos.ShowAsync(Guid.CreateVersion7().ToString(), Ct));
    }

    [Theory]
    [InlineData(HideReason.NotKing, null)]
    [InlineData(HideReason.ShowsPerson, null)]
    [InlineData(HideReason.Rude, "rude words")]
    [InlineData(HideReason.Unlawful, "reported to NCMEC on Oct 12")]
    [InlineData(HideReason.Other, "a blurry thumb")]
    public async Task A_hidden_photo_keeps_why_when_and_by_whom_until_it_is_shown_again(HideReason reason, string? note)
    {
        var (photos, _, _) = CreateStores();
        var photo = NewPhoto(0);
        await photos.AddAsync(photo, Ct);

        await photos.HideAsync(photo.Id, Because(reason, note), Ct);
        Assert.Equal(new PhotoHiding(reason, note, T0.AddDays(1), "Wallie"), (await photos.FindAsync(photo.Id, Ct))!.Hiding);
        Assert.Equal(Because(reason, note), (await photos.GetHiddenAsync(Ct)).Single().Hiding);

        await photos.ShowAsync(photo.Id, Ct);
        Assert.Null((await photos.FindAsync(photo.Id, Ct))!.Hiding);
        Assert.Null((await FirstPage(photos)).Single().Hiding);
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
