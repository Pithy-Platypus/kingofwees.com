using Microsoft.AspNetCore.Http.HttpResults;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.King;

public static class KingEndpoints
{
    public const string ReporterKeyHeader = "X-Reporter-Key";
    public static readonly TimeSpan UndoWindow = TimeSpan.FromMinutes(10);
    private const int RecentCount = 10;

    public static IEndpointRouteBuilder MapKingEndpoints(this IEndpointRouteBuilder routes)
    {
        var king = routes.MapGroup("/api/king").AddEndpointFilter<ValidationFilter>();
        king.MapGet("/status", GetStatus);
        king.MapGet("/history", GetHistory);
        king.MapGet("/heat", GetHeat);
        king.MapGet("/spots", ListSpots);
        king.MapGet("/map", GetMap);

        var writes = king.MapGroup("")
            .RequireAuthorization(KingPolicies.CanPost)
            .RequireRateLimiting(KingPolicies.Writes);
        writes.MapPost("/feedings", LogFeeding);
        writes.MapPost("/sightings", LogSighting);
        writes.MapPost("/spots", AddSpot);
        writes.MapDelete("/events/{id}", Undo);
        writes.MapPatch("/events/{id}", Rename);

        return routes;
    }

    private static async Task<Ok<KingStatus>> GetStatus(
        IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var lastFed = await store.GetLatestAsync(KingEventKind.Fed, cancellationToken);
        var lastSeen = await store.GetLatestSightingAsync(cancellationToken);
        var recent = await store.GetPageAsync(before: null, RecentCount, cancellationToken);
        var view = await EventViews(spots, cancellationToken);

        return TypedResults.Ok(new KingStatus(
            lastFed is null ? null : view(lastFed),
            lastSeen is null ? null : view(lastSeen),
            [.. recent.Select(view)]));
    }

    // A street has a handful of spots; one read beats a lookup per event.
    internal static async Task<Func<KingEvent, EventView>> EventViews(ISpotStore spots, CancellationToken cancellationToken)
    {
        var spotsById = (await spots.ListAsync(cancellationToken)).ToDictionary(s => s.Id);
        return e => EventView.From(e, e.SpotId is null ? null : spotsById.GetValueOrDefault(e.SpotId));
    }

    private static async Task<Ok<HistoryPage>> GetHistory(
        [AsParameters] HistoryQuery query, IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var limit = query.Limit ?? HistoryQuery.DefaultLimit;
        // The validator has already checked that the cursor names an event.
        var before = query.Before is null ? null : await store.FindAsync(query.Before, cancellationToken);
        // One extra tells whether an older page exists without a second query.
        var events = await store.GetPageAsync(before, limit + 1, cancellationToken);
        var page = events.Take(limit).ToList();
        var view = await EventViews(spots, cancellationToken);

        return TypedResults.Ok(new HistoryPage(
            [.. page.Select(view)], events.Count > limit ? page[^1].Id : null));
    }

    private static async Task<Ok<HeatMap>> GetHeat(
        [AsParameters] HeatQuery query, IKingEventStore store, ISpotStore spots, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        DateTimeOffset? since = query.Days is { } days ? clock.GetUtcNow().AddDays(-days) : null;
        var spotsById = (await spots.ListAsync(cancellationToken)).ToDictionary(s => s.Id);
        var seen = query.Layer == HeatQuery.Seen;
        // A spot that no longer exists has no place to show.
        var feedings = (await store.CountFeedingsBySpotAsync(since, seenOnly: seen, cancellationToken))
            .Where(c => spotsById.ContainsKey(c.SpotId))
            .Select(c => (Spot: spotsById[c.SpotId], c.Count));

        IEnumerable<HeatCell> cells = seen
            ? (await store.CountSightingsByPlaceAsync(since, cancellationToken))
                .Select(c => (c.Place, c.Count))
                .Concat(feedings.Select(f => (Place: f.Spot.Location, f.Count)))
                .GroupBy(c => c.Place, (place, group) => new HeatCell(place, group.Sum(c => c.Count), SpotName: null))
            : feedings.Select(f => new HeatCell(f.Spot.Location, f.Count, f.Spot.Name));

        return TypedResults.Ok(new HeatMap(
            [.. cells.OrderByDescending(c => c.Count).ThenBy(c => c.Location.Latitude).ThenBy(c => c.Location.Longitude)]));
    }

    // No configured center means no map; the app still works without one.
    private static Results<Ok<MapView>, NotFound> GetMap(IOptions<MapOptions> options) =>
        options.Value.Center is { } center ? TypedResults.Ok(new MapView(center)) : TypedResults.NotFound();

    private static async Task<Ok<SpotView[]>> ListSpots(ISpotStore spots, CancellationToken cancellationToken) =>
        TypedResults.Ok((await spots.ListAsync(cancellationToken)).Select(SpotView.From).ToArray());

    private static async Task<Created<SpotView>> AddSpot(
        AddSpotRequest request, ISpotStore spots, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        // The validator guarantees a location; GeoPoint has already rounded it.
        var spot = new Spot(Guid.CreateVersion7(now).ToString(), request.Name.Trim(), request.Location!, now, request.ReporterKey);
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
            KingEventKind.Fed, request.ReporterKey, request.ReporterName, request.Foods ?? [], request.SawKing ?? true,
            spot, location: null, store, clock, cancellationToken);
    }

    private static Task<Created<EventView>> LogSighting(
        LogSightingRequest request, IKingEventStore store, TimeProvider clock, KingMetrics metrics, CancellationToken cancellationToken)
    {
        metrics.SightingLogged();
        return Log(
            KingEventKind.Seen, request.ReporterKey, request.ReporterName, foods: [], sawKing: true,
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

    private static Task<Results<NoContent, NotFound, ProblemHttpResult>> Undo(
        string id, [FromHeader(Name = ReporterKeyHeader)] string reporterKey,
        IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken) =>
        ChangeOwnRecent(id, reporterKey, store, clock, () => store.DeleteAsync(id, cancellationToken), cancellationToken);

    private static Task<Results<NoContent, NotFound, ProblemHttpResult>> Rename(
        string id, RenameEventRequest request, [FromHeader(Name = ReporterKeyHeader)] string reporterKey,
        IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken) =>
        ChangeOwnRecent(
            id, reporterKey, store, clock, () => store.RenameAsync(id, request.ReporterName, cancellationToken), cancellationToken);

    // Only the device that logged an entry may change it, and only within the undo window.
    // Wrong device and unknown id both answer 404, so a guessed id reveals nothing.
    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> ChangeOwnRecent(
        string id, string reporterKey, IKingEventStore store, TimeProvider clock, Func<Task> change,
        CancellationToken cancellationToken)
    {
        var kingEvent = await store.FindAsync(id, cancellationToken);
        if (kingEvent is null || kingEvent.ReporterKey != reporterKey)
        {
            return TypedResults.NotFound();
        }

        if (clock.GetUtcNow() - kingEvent.OccurredAt > UndoWindow)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, type: "undo.expired");
        }

        await change();
        return TypedResults.NoContent();
    }
}
