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
        king.MapGet("/spots", ListSpots);
        king.MapGet("/map", GetMap);

        var writes = king.MapGroup("")
            .RequireAuthorization(KingPolicies.CanPost)
            .RequireRateLimiting(KingPolicies.Writes);
        writes.MapPost("/feedings", LogFeeding);
        writes.MapPost("/sightings", LogSighting);
        writes.MapPost("/spots", AddSpot);
        writes.MapDelete("/events/{id}", Undo);

        return routes;
    }

    private static async Task<Ok<KingStatus>> GetStatus(
        IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var lastFed = await store.GetLatestAsync(KingEventKind.Fed, cancellationToken);
        var lastSeen = await store.GetLatestSightingAsync(cancellationToken);
        var recent = await store.GetRecentAsync(RecentCount, cancellationToken);
        // A street has a handful of spots; one read beats a lookup per event.
        var spotsById = (await spots.ListAsync(cancellationToken)).ToDictionary(s => s.Id);
        EventView View(KingEvent e) => EventView.From(e, e.SpotId is null ? null : spotsById.GetValueOrDefault(e.SpotId));

        return TypedResults.Ok(new KingStatus(
            lastFed is null ? null : View(lastFed),
            lastSeen is null ? null : View(lastSeen),
            [.. recent.Select(View)]));
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

    // Wrong device and unknown id both answer 404, so a guessed id reveals nothing.
    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Undo(
        string id, [FromHeader(Name = ReporterKeyHeader)] string reporterKey,
        IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken)
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

        await store.DeleteAsync(id, cancellationToken);
        return TypedResults.NoContent();
    }
}
