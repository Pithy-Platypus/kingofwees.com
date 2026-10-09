using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Every IKingEventStore implementation (real and test double) must pass these.
public abstract class KingEventStoreContract
{
    // Mongo stores milliseconds; contract times stay on whole seconds so every store round-trips exactly.
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    // Both share state: the event store leaves out devices the hidden-reporter store has hidden.
    protected abstract (IKingEventStore Events, IHiddenReporterStore Hidden) CreateStores();

    private IKingEventStore CreateStore() => CreateStores().Events;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static KingEvent Event(
        KingEventKind kind, int minutesAfterT0, string? name = "Jamie", Food[]? foods = null, bool sawKing = true,
        string? spotId = null, GeoPoint? location = null, string device = "device-key-1") =>
        new(Guid.CreateVersion7().ToString(), kind, T0.AddMinutes(minutesAfterT0), device, name, foods ?? [], sawKing, spotId,
            location);

    // Records holding lists compare the lists by reference, so compare structure instead.
    private static void AssertSameEvent(KingEvent? expected, KingEvent? actual) => Assert.Equivalent(expected, actual, strict: true);

    [Fact]
    public async Task Added_event_is_found_by_id_with_every_field_intact()
    {
        var store = CreateStore();
        var fed = Event(KingEventKind.Fed, 0, name: "Jamie", foods: [Food.Wet, Food.Treats], spotId: "spot-1");

        await store.AddAsync(fed, Ct);

        AssertSameEvent(fed, await store.FindAsync(fed.Id, Ct));
    }

    [Fact]
    public async Task A_feeding_where_food_was_left_out_round_trips_as_not_seen()
    {
        var store = CreateStore();
        var leftOut = Event(KingEventKind.Fed, 0, sawKing: false);

        await store.AddAsync(leftOut, Ct);

        AssertSameEvent(leftOut, await store.FindAsync(leftOut.Id, Ct));
    }

    [Fact]
    public async Task A_sighting_keeps_where_he_was_seen()
    {
        var store = CreateStore();
        var seen = Event(KingEventKind.Seen, 0, location: new GeoPoint(45.523, -122.677));

        await store.AddAsync(seen, Ct);

        AssertSameEvent(seen, await store.FindAsync(seen.Id, Ct));
    }

    [Fact]
    public async Task Optional_fields_round_trip_as_null()
    {
        var store = CreateStore();
        var seen = Event(KingEventKind.Seen, 0, name: null, foods: []);

        await store.AddAsync(seen, Ct);

        AssertSameEvent(seen, await store.FindAsync(seen.Id, Ct));
    }

    [Fact]
    public async Task Find_returns_null_for_unknown_id()
    {
        var store = CreateStore();
        // A non-empty store, so a lookup that ignores the id can't pass by accident.
        await store.AddAsync(Event(KingEventKind.Fed, 0), Ct);

        Assert.Null(await store.FindAsync(Guid.CreateVersion7().ToString(), Ct));
    }

    [Fact]
    public async Task Latest_is_the_newest_event_of_the_requested_kind_only()
    {
        var store = CreateStore();
        var olderFed = Event(KingEventKind.Fed, 1);
        var newerFed = Event(KingEventKind.Fed, 3);
        var newestSeen = Event(KingEventKind.Seen, 4);
        // Insert out of time order so insertion order can't masquerade as time order.
        await store.AddAsync(newerFed, Ct);
        await store.AddAsync(newestSeen, Ct);
        await store.AddAsync(olderFed, Ct);

        AssertSameEvent(newerFed, await store.GetLatestAsync(KingEventKind.Fed, Ct));
        AssertSameEvent(newestSeen, await store.GetLatestAsync(KingEventKind.Seen, Ct));
    }

    [Fact]
    public async Task Latest_is_null_when_no_event_of_that_kind_exists()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Seen, 0), Ct);

        Assert.Null(await store.GetLatestAsync(KingEventKind.Fed, Ct));
    }

    [Fact]
    public async Task Latest_sighting_is_a_feeding_where_he_was_seen_when_that_is_newest()
    {
        var store = CreateStore();
        var sighting = Event(KingEventKind.Seen, 1);
        var seenFeeding = Event(KingEventKind.Fed, 2);
        await store.AddAsync(seenFeeding, Ct);
        await store.AddAsync(sighting, Ct);

        AssertSameEvent(seenFeeding, await store.GetLatestSightingAsync(Ct));
    }

    [Fact]
    public async Task Latest_sighting_ignores_feedings_where_food_was_left_out()
    {
        var store = CreateStore();
        var sighting = Event(KingEventKind.Seen, 1);
        await store.AddAsync(Event(KingEventKind.Fed, 2, sawKing: false), Ct);
        await store.AddAsync(sighting, Ct);

        AssertSameEvent(sighting, await store.GetLatestSightingAsync(Ct));
    }

    [Fact]
    public async Task Latest_sighting_is_a_newer_sighting_over_an_older_seen_feeding()
    {
        var store = CreateStore();
        var sighting = Event(KingEventKind.Seen, 2);
        await store.AddAsync(sighting, Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 1), Ct);

        AssertSameEvent(sighting, await store.GetLatestSightingAsync(Ct));
    }

    [Fact]
    public async Task Latest_sighting_is_null_when_food_was_only_ever_left_out()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Fed, 0, sawKing: false), Ct);

        Assert.Null(await store.GetLatestSightingAsync(Ct));
    }

    [Fact]
    public async Task First_page_is_newest_first_and_limited_to_count()
    {
        var store = CreateStore();
        var first = Event(KingEventKind.Fed, 1);
        var second = Event(KingEventKind.Seen, 2);
        var third = Event(KingEventKind.Fed, 3);
        await store.AddAsync(second, Ct);
        await store.AddAsync(third, Ct);
        await store.AddAsync(first, Ct);

        var page = await store.GetPageAsync(before: null, 2, Ct);

        Assert.Equal([third.Id, second.Id], page.Select(e => e.Id));
        AssertSameEvent(third, page[0]);
    }

    [Fact]
    public async Task Next_page_continues_after_the_last_event_of_the_previous_one()
    {
        var store = CreateStore();
        var events = Enumerable.Range(1, 5).Select(minute => Event(KingEventKind.Fed, minute)).ToArray();
        foreach (var e in events.Reverse()) await store.AddAsync(e, Ct);

        var page = await store.GetPageAsync(before: events[3], 2, Ct);

        Assert.Equal([events[2].Id, events[1].Id], page.Select(e => e.Id));
    }

    [Fact]
    public async Task Events_logged_in_the_same_instant_are_paged_by_id_without_skips_or_repeats()
    {
        var store = CreateStore();
        // Ids chosen so id order differs from insertion order.
        var sameTime = new[] { "b", "d", "a", "c" }
            .Select(id => Event(KingEventKind.Seen, 0) with { Id = id }).ToArray();
        foreach (var e in sameTime) await store.AddAsync(e, Ct);
        await store.AddAsync(Event(KingEventKind.Fed, -1) with { Id = "z-older" }, Ct);

        var firstPage = await store.GetPageAsync(before: null, 2, Ct);
        var secondPage = await store.GetPageAsync(before: firstPage[^1], 2, Ct);
        var thirdPage = await store.GetPageAsync(before: secondPage[^1], 2, Ct);

        Assert.Equal(["d", "c"], firstPage.Select(e => e.Id));
        Assert.Equal(["b", "a"], secondPage.Select(e => e.Id));
        Assert.Equal(["z-older"], thirdPage.Select(e => e.Id));
    }

    [Fact]
    public async Task Page_after_the_oldest_event_is_empty()
    {
        var store = CreateStore();
        var only = Event(KingEventKind.Fed, 0);
        await store.AddAsync(only, Ct);

        Assert.Empty(await store.GetPageAsync(before: only, 10, Ct));
    }

    private static readonly GeoPoint PlaceA = new(45.523, -122.677);
    private static readonly GeoPoint PlaceB = new(45.524, -122.677);

    // Stores may return counts in any order.
    private static void AssertCounts<T>(IEnumerable<T> expected, IEnumerable<T> actual) =>
        Assert.Equal(expected.Select(c => c!.ToString()).Order(), actual.Select(c => c!.ToString()).Order());

    [Fact]
    public async Task Sightings_are_counted_per_place_and_those_without_one_are_left_out()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Seen, 1, location: PlaceA), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 2, location: PlaceA), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 3, location: PlaceB), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 4), Ct);

        AssertCounts([new PlaceCount(PlaceA, 2), new PlaceCount(PlaceB, 1)], await store.CountSightingsByPlaceAsync(since: null, Ct));
    }

    [Fact]
    public async Task Sighting_counts_skip_events_where_king_was_not_seen()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Seen, 1, location: PlaceA), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 2, sawKing: false, location: PlaceA), Ct);

        AssertCounts([new PlaceCount(PlaceA, 1)], await store.CountSightingsByPlaceAsync(since: null, Ct));
    }

    [Fact]
    public async Task Sighting_counts_start_at_since_inclusive()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Seen, 1, location: PlaceA), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 2, location: PlaceA), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 3, location: PlaceB), Ct);

        AssertCounts(
            [new PlaceCount(PlaceA, 1), new PlaceCount(PlaceB, 1)],
            await store.CountSightingsByPlaceAsync(since: T0.AddMinutes(2), Ct));
    }

    [Fact]
    public async Task Feedings_are_counted_per_spot_including_food_left_out()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Fed, 1, spotId: "porch"), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 2, spotId: "porch", sawKing: false), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 3, spotId: "steps"), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 4), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 5, location: PlaceA), Ct);

        AssertCounts(
            [new SpotCount("porch", 2), new SpotCount("steps", 1)],
            await store.CountFeedingsBySpotAsync(since: null, seenOnly: false, Ct));
    }

    [Fact]
    public async Task Seen_only_feeding_counts_skip_food_left_out()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Fed, 1, spotId: "porch"), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 2, spotId: "porch", sawKing: false), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 3, spotId: "steps", sawKing: false), Ct);

        AssertCounts([new SpotCount("porch", 1)], await store.CountFeedingsBySpotAsync(since: null, seenOnly: true, Ct));
    }

    [Fact]
    public async Task Feeding_counts_start_at_since_inclusive()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Fed, 1, spotId: "porch"), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 2, spotId: "porch"), Ct);

        AssertCounts([new SpotCount("porch", 1)], await store.CountFeedingsBySpotAsync(since: T0.AddMinutes(2), seenOnly: false, Ct));
    }

    [Fact]
    public async Task Rename_changes_only_that_event_s_name()
    {
        var store = CreateStore();
        var renamed = Event(KingEventKind.Fed, 0, name: "Guy", foods: [Food.Dry], spotId: "spot-1");
        var other = Event(KingEventKind.Seen, 1, name: "Guy");
        await store.AddAsync(renamed, Ct);
        await store.AddAsync(other, Ct);

        Assert.True(await store.RenameAsync(renamed.Id, "Kael", Ct));

        AssertSameEvent(renamed with { ReporterName = "Kael" }, await store.FindAsync(renamed.Id, Ct));
        AssertSameEvent(other, await store.FindAsync(other.Id, Ct));
    }

    [Fact]
    public async Task Rename_to_no_name_clears_it()
    {
        var store = CreateStore();
        var seen = Event(KingEventKind.Seen, 0, name: "Guy");
        await store.AddAsync(seen, Ct);

        Assert.True(await store.RenameAsync(seen.Id, null, Ct));

        Assert.Null((await store.FindAsync(seen.Id, Ct))?.ReporterName);
    }

    [Fact]
    public async Task Rename_of_an_unknown_event_reports_false()
    {
        var store = CreateStore();
        await store.AddAsync(Event(KingEventKind.Fed, 0), Ct);

        Assert.False(await store.RenameAsync(Guid.CreateVersion7().ToString(), "Kael", Ct));
    }

    [Fact]
    public async Task Delete_removes_the_event_and_reports_whether_it_existed()
    {
        var store = CreateStore();
        var fed = Event(KingEventKind.Fed, 0);
        await store.AddAsync(fed, Ct);

        Assert.True(await store.DeleteAsync(fed.Id, Ct));
        Assert.Null(await store.FindAsync(fed.Id, Ct));
        Assert.False(await store.DeleteAsync(fed.Id, Ct));
    }

    // Hiding spam: every read a visitor can reach leaves out hidden entries and every entry from a hidden device.
    private static readonly GeoPoint Block = new(45.523, -122.677);

    private static async Task AssertPublicReadsShowOnly(IKingEventStore store, KingEvent fed, KingEvent seen)
    {
        Assert.Equal(fed.Id, (await store.GetLatestAsync(KingEventKind.Fed, Ct))?.Id);
        Assert.Equal(seen.Id, (await store.GetLatestAsync(KingEventKind.Seen, Ct))?.Id);
        Assert.Equal(seen.Id, (await store.GetLatestSightingAsync(Ct))?.Id);
        Assert.Equal([seen.Id, fed.Id], (await store.GetPageAsync(before: null, 10, Ct)).Select(e => e.Id));
        Assert.Equal([new PlaceCount(Block, 1)], await store.CountSightingsByPlaceAsync(since: null, Ct));
        Assert.Equal([new SpotCount("porch", 1)], await store.CountFeedingsBySpotAsync(since: null, seenOnly: false, Ct));
        Assert.Equal([new SpotCount("porch", 1)], await store.CountFeedingsBySpotAsync(since: null, seenOnly: true, Ct));
    }

    [Fact]
    public async Task A_hidden_entry_is_left_out_of_every_public_read_but_the_device_s_others_stay()
    {
        var store = CreateStore();
        var fed = Event(KingEventKind.Fed, 0, spotId: "porch");
        var seen = Event(KingEventKind.Seen, 1, location: Block);
        var spamFed = Event(KingEventKind.Fed, 5, spotId: "porch");
        var spamSeen = Event(KingEventKind.Seen, 6, location: Block);
        foreach (var e in new[] { fed, seen, spamFed, spamSeen }) await store.AddAsync(e, Ct);

        Assert.True(await store.SetHiddenAsync(spamFed.Id, hidden: true, Ct));
        Assert.True(await store.SetHiddenAsync(spamSeen.Id, hidden: true, Ct));

        await AssertPublicReadsShowOnly(store, fed, seen);
    }

    [Fact]
    public async Task Every_entry_from_a_hidden_device_is_left_out_including_later_ones()
    {
        var (store, hidden) = CreateStores();
        var fed = Event(KingEventKind.Fed, 0, spotId: "porch", device: "neighbor");
        var seen = Event(KingEventKind.Seen, 1, location: Block, device: "neighbor");
        await store.AddAsync(fed, Ct);
        await store.AddAsync(seen, Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 5, spotId: "porch", device: "spammer"), Ct);

        await hidden.HideAsync("spammer", T0.AddMinutes(10), Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 11, location: Block, device: "spammer"), Ct);

        await AssertPublicReadsShowOnly(store, fed, seen);
    }

    [Fact]
    public async Task Unhiding_an_entry_and_restoring_a_device_bring_everything_back()
    {
        var (store, hidden) = CreateStores();
        var fed = Event(KingEventKind.Fed, 0, spotId: "porch");
        var seen = Event(KingEventKind.Seen, 1, location: Block, device: "spammer");
        await store.AddAsync(fed, Ct);
        await store.AddAsync(seen, Ct);
        await store.SetHiddenAsync(fed.Id, hidden: true, Ct);
        var record = await hidden.HideAsync("spammer", T0.AddMinutes(10), Ct);

        Assert.True(await store.SetHiddenAsync(fed.Id, hidden: false, Ct));
        Assert.True(await hidden.RestoreAsync(record.Id, Ct));

        await AssertPublicReadsShowOnly(store, fed, seen);
    }

    [Fact]
    public async Task Hidden_entries_are_still_found_by_id()
    {
        // Undo, rename and history cursors look entries up by id.
        var (store, hidden) = CreateStores();
        var hiddenEntry = Event(KingEventKind.Fed, 0);
        var fromHiddenDevice = Event(KingEventKind.Seen, 1, device: "spammer");
        await store.AddAsync(hiddenEntry, Ct);
        await store.AddAsync(fromHiddenDevice, Ct);

        await store.SetHiddenAsync(hiddenEntry.Id, hidden: true, Ct);
        await hidden.HideAsync("spammer", T0, Ct);

        AssertSameEvent(hiddenEntry, await store.FindAsync(hiddenEntry.Id, Ct));
        AssertSameEvent(fromHiddenDevice, await store.FindAsync(fromHiddenDevice.Id, Ct));
    }

    [Fact]
    public async Task Hiding_an_unknown_entry_reports_false()
    {
        var store = CreateStore();

        Assert.False(await store.SetHiddenAsync(Guid.CreateVersion7().ToString(), hidden: true, Ct));
    }

    [Fact]
    public async Task Hidden_entries_are_listed_newest_first_leaving_out_ones_hidden_only_by_device()
    {
        var (store, hidden) = CreateStores();
        var older = Event(KingEventKind.Fed, 0);
        var newer = Event(KingEventKind.Seen, 1);
        var visible = Event(KingEventKind.Fed, 2);
        var fromHiddenDevice = Event(KingEventKind.Fed, 3, device: "spammer");
        foreach (var e in new[] { older, newer, visible, fromHiddenDevice }) await store.AddAsync(e, Ct);
        await store.SetHiddenAsync(older.Id, hidden: true, Ct);
        await store.SetHiddenAsync(newer.Id, hidden: true, Ct);
        await hidden.HideAsync("spammer", T0, Ct);

        Assert.Equal([newer.Id, older.Id], (await store.GetHiddenEntriesAsync(Ct)).Select(e => e.Id));
    }

    [Fact]
    public async Task A_device_summary_counts_all_its_entries_and_names_the_newest()
    {
        var (store, hidden) = CreateStores();
        var first = Event(KingEventKind.Fed, 0, name: "Old name", device: "spammer");
        await store.AddAsync(first, Ct);
        await store.AddAsync(Event(KingEventKind.Seen, 2, name: "Spammy", device: "spammer"), Ct);
        await store.AddAsync(Event(KingEventKind.Fed, 5, name: "Neighbor", device: "neighbor"), Ct);
        await store.SetHiddenAsync(first.Id, hidden: true, Ct);
        await hidden.HideAsync("spammer", T0, Ct);

        Assert.Equal(new ReporterSummary(2, T0.AddMinutes(2), "Spammy"), await store.SummarizeReporterAsync("spammer", Ct));
        Assert.Equal(new ReporterSummary(0, null, null), await store.SummarizeReporterAsync("nobody", Ct));
    }
}
