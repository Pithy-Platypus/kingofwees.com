using Microsoft.AspNetCore.Http.HttpResults;
using KingOfWees.Server.Photos;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.King;

public static class KingEndpoints
{
    public const string ReporterKeyHeader = "X-Reporter-Key";
    public static readonly TimeSpan UndoWindow = TimeSpan.FromMinutes(10);
    private const int RecentCount = 10;

    /// <summary>On the validated <c>/api</c> group (<c>Program.cs</c>).</summary>
    public static IEndpointRouteBuilder MapKingEndpoints(this IEndpointRouteBuilder routes)
    {
        // The innermost limit wins: writes and photo files count only against their own.
        var king = routes.MapGroup("/king").RequireRateLimiting(KingPolicies.Reads);
        king.MapGet("/status", GetStatus);
        king.MapGet("/history", GetHistory);
        king.MapGet("/heat", GetHeat);
        king.MapGet("/habits", GetHabits);
        king.MapGet("/spots", ListSpots);
        king.MapGet("/map", GetMap);
        king.MapPhotoReads();
        king.MapGet("/posting", (PostingCountry posting, HttpContext context) =>
            TypedResults.Ok(new PostingView(posting.Allows(context.Connection.RemoteIpAddress))));

        var writes = king.MapGroup("")
            .RequireAuthorization(KingPolicies.CanPost)
            .RequireRateLimiting(KingPolicies.Writes)
            .AddEndpointFilter<PostingCountryFilter>();
        writes.MapPost("/feedings", LogFeeding);
        writes.MapPost("/sightings", LogSighting);
        writes.MapPost("/spots", AddSpot);
        writes.MapDelete("/events/{id}", Undo);
        writes.MapPatch("/events/{id}", Rename);
        writes.MapPhotoWrites();

        return routes;
    }

    private static async Task<Ok<KingStatus>> GetStatus(
        HiddenSets hidden, IKingEventStore store, IPhotoStore photos, PhotoVisibility visibility, EventViewer viewer,
        CancellationToken cancellationToken)
    {
        var lastFed = await store.GetLatestAsync(hidden, KingEventKind.Fed, cancellationToken);
        var lastSeen = await store.GetLatestSightingAsync(hidden, cancellationToken);
        var recent = await store.GetPageAsync(hidden, before: null, RecentCount, cancellationToken);
        var view = await viewer.ViewsAsync([.. recent, .. new[] { lastFed, lastSeen }.OfType<KingEvent>()], cancellationToken);
        var latestPhoto = await photos.GetPageAsync(hidden, before: null, 1, cancellationToken);
        visibility.Remember(latestPhoto); // Home's avatar asks for its thumbnail next

        return TypedResults.Ok(new KingStatus(
            lastFed is null ? null : view(lastFed),
            lastSeen is null ? null : view(lastSeen),
            [.. recent.Select(view)],
            (await PhotoEndpoints.PhotoViews(viewer, latestPhoto, store, cancellationToken)).FirstOrDefault()));
    }

    private static async Task<Ok<HistoryPage>> GetHistory(
        [AsParameters] HistoryQuery query, HiddenSets hidden, IKingEventStore store, EventViewer viewer, CancellationToken cancellationToken)
    {
        var limit = query.Limit ?? Paging.DefaultLimit;
        // The validator has already checked that the cursor names an event.
        var before = query.Before is null ? null : await store.FindAsync(query.Before, cancellationToken);
        var (page, next) = Paging.Page(await store.GetPageAsync(hidden, before, limit + 1, cancellationToken), limit, e => e.Id);
        var view = await viewer.ViewsAsync(page, cancellationToken);

        return TypedResults.Ok(new HistoryPage([.. page.Select(view)], next));
    }

    private static async Task<Ok<HeatMap>> GetHeat(
        [AsParameters] HeatQuery query, HiddenSets hidden, IKingEventStore store, ISpotStore spots, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        DateTimeOffset? since = query.Days is { } days ? clock.GetUtcNow().AddDays(-days) : null;
        var spotsById = (await spots.ListAsync(hidden, cancellationToken)).ToDictionary(s => s.Id);
        var seen = query.Layer == HeatQuery.Seen;
        // A spot that no longer exists has no place to show.
        var feedings = (await store.CountFeedingsBySpotAsync(hidden, since, seenOnly: seen, cancellationToken))
            .Where(c => spotsById.ContainsKey(c.SpotId))
            .Select(c => (Spot: spotsById[c.SpotId], c.Count));

        IEnumerable<HeatCell> cells = seen
            ? (await store.CountSightingsByPlaceAsync(hidden, since, cancellationToken))
                .Select(c => (c.Place, c.Count))
                .Concat(feedings.Select(f => (Place: f.Spot.Location, f.Count)))
                .GroupBy(c => c.Place, (place, group) => new HeatCell(place, group.Sum(c => c.Count), SpotName: null))
            : feedings.Select(f => new HeatCell(f.Spot.Location, f.Count, f.Spot.Name));

        return TypedResults.Ok(new HeatMap(
            [.. cells.OrderByDescending(c => c.Count).ThenBy(c => c.Location.Latitude).ThenBy(c => c.Location.Longitude)]));
    }

    private static async Task<Ok<HabitsView>> GetHabits(
        [AsParameters] HabitsQuery query, HiddenSets hidden, IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken)
    {
        DateTimeOffset? since = query.Days is { } days ? clock.GetUtcNow().AddDays(-days) : null;
        var events = await store.GetPageAsync(hidden, null, HabitsView.MaxEntries, cancellationToken);
        return TypedResults.Ok(new HabitsView([.. events.Select(HabitEntry.From)], HabitsView.CourtOf(events, since)));
    }

    // No configured center means no map; the app still works without one.
    private static Results<Ok<MapView>, NotFound> GetMap(IOptions<MapOptions> options) =>
        options.Value.Center is { } center ? TypedResults.Ok(new MapView(center)) : TypedResults.NotFound();

    private static async Task<Ok<SpotView[]>> ListSpots(HiddenSets hidden, ISpotStore spots, CancellationToken cancellationToken) =>
        TypedResults.Ok((await spots.ListAsync(hidden, cancellationToken)).Select(SpotView.From).ToArray());

    private static async Task<Created<SpotView>> AddSpot(
        AddSpotRequest request, ISpotStore spots, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        // The validator guarantees a location; GeoPoint has already rounded it.
        var spot = new Spot(Guid.CreateVersion7(now).ToString(), request.CleanName!, request.Location!, now, request.ReporterKey);
        await spots.AddAsync(spot, cancellationToken);
        return TypedResults.Created((string?)null, SpotView.From(spot));
    }

    private static async Task<Created<EventView>> LogFeeding(
        LogFeedingRequest request, IKingEventStore store, ISpotStore spots, TimeProvider clock, KingMetrics metrics,
        CancellationToken cancellationToken)
    {
        metrics.FeedingLogged();
        // The validator has already checked that the spot exists.
        var spot = request.SpotId is null ? null : await spots.FindAsync(request.SpotId, cancellationToken);
        return await Log(
            KingEventKind.Fed, request.ReporterKey, request.CleanReporterName, request.Foods ?? [], request.SawKing ?? true,
            spot, location: null, store, clock, cancellationToken);
    }

    private static Task<Created<EventView>> LogSighting(
        LogSightingRequest request, IKingEventStore store, TimeProvider clock, KingMetrics metrics, CancellationToken cancellationToken)
    {
        metrics.SightingLogged();
        return Log(
            KingEventKind.Seen, request.ReporterKey, request.CleanReporterName, foods: [], sawKing: true,
            spot: null, request.Location, store, clock, cancellationToken);
    }

    private static async Task<Created<EventView>> Log(
        KingEventKind kind, string reporterKey, string? reporterName, IReadOnlyList<Food> foods, bool sawKing,
        Spot? spot, GeoPoint? location, IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var kingEvent = new KingEvent(
            Guid.CreateVersion7(now).ToString(), kind, now, reporterKey, reporterName, foods, sawKing, spot?.Id, location);
        await store.AddAsync(kingEvent, cancellationToken);
        return TypedResults.Created($"/api/king/events/{kingEvent.Id}", EventView.From(kingEvent, spot));
    }

    // An undone entry takes its photo with it.
    private static Task<Results<NoContent, NotFound, ProblemHttpResult>> Undo(
        string id, [FromHeader(Name = ReporterKeyHeader)] string reporterKey,
        IKingEventStore store, IPhotoStore photos, IPhotoBlobStore photoFiles, TimeProvider clock, CancellationToken cancellationToken) =>
        ChangeOwnRecent(id, reporterKey, store, clock, async () =>
        {
            await store.DeleteAsync(id, cancellationToken);
            if (await photos.FindByEventAsync(id, cancellationToken) is { } photo)
            {
                await PhotoEndpoints.DeleteWithFilesAsync(photo, photos, photoFiles, cancellationToken);
            }
        }, cancellationToken);

    private static Task<Results<NoContent, NotFound, ProblemHttpResult>> Rename(
        string id, RenameEventRequest request, [FromHeader(Name = ReporterKeyHeader)] string reporterKey,
        IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken) =>
        ChangeOwnRecent(
            id, reporterKey, store, clock, () => store.RenameAsync(id, request.CleanReporterName, cancellationToken), cancellationToken);

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> ChangeOwnRecent(
        string id, string reporterKey, IKingEventStore store, TimeProvider clock, Func<Task> change,
        CancellationToken cancellationToken)
    {
        var kingEvent = await store.FindAsync(id, cancellationToken);
        switch (CheckOwnRecent(kingEvent?.ReporterKey, kingEvent?.OccurredAt, reporterKey, clock))
        {
            case OwnRecent.NotFound: return TypedResults.NotFound();
            case OwnRecent.Expired: return UndoExpired();
        }

        await change();
        return TypedResults.NoContent();
    }

    internal enum OwnRecent { Yes, NotFound, Expired }

    // Only the device that posted something may change it, and only within the undo window.
    // Wrong device and unknown id are both NotFound (a 404), so a guessed id reveals nothing.
    internal static OwnRecent CheckOwnRecent(string? ownerKey, DateTimeOffset? postedAt, string reporterKey, TimeProvider clock) =>
        ownerKey is null || ownerKey != reporterKey ? OwnRecent.NotFound
        : clock.GetUtcNow() - postedAt > UndoWindow ? OwnRecent.Expired
        : OwnRecent.Yes;

    internal static ProblemHttpResult UndoExpired() =>
        TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, type: "undo.expired");
}
