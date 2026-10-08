using Microsoft.AspNetCore.Http.HttpResults;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.Mvc;

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

        var writes = king.MapGroup("")
            .RequireAuthorization(KingPolicies.CanPost)
            .RequireRateLimiting(KingPolicies.Writes);
        writes.MapPost("/feedings", LogFeeding);
        writes.MapPost("/sightings", LogSighting);
        writes.MapDelete("/events/{id}", Undo);

        return routes;
    }

    private static async Task<Ok<KingStatus>> GetStatus(IKingEventStore store, CancellationToken cancellationToken)
    {
        var lastFed = await store.GetLatestAsync(KingEventKind.Fed, cancellationToken);
        var lastSeen = await store.GetLatestAsync(KingEventKind.Seen, cancellationToken);
        var recent = await store.GetRecentAsync(RecentCount, cancellationToken);

        return TypedResults.Ok(new KingStatus(
            lastFed is null ? null : EventView.From(lastFed),
            lastSeen is null ? null : EventView.From(lastSeen),
            [.. recent.Select(EventView.From)]));
    }

    private static Task<Created<EventView>> LogFeeding(
        LogFeedingRequest request, IKingEventStore store, TimeProvider clock, KingMetrics metrics, CancellationToken cancellationToken)
    {
        metrics.FeedingLogged();
        return Log(KingEventKind.Fed, request.ReporterKey, request.ReporterName, request.Foods ?? [], store, clock, cancellationToken);
    }

    private static Task<Created<EventView>> LogSighting(
        LogSightingRequest request, IKingEventStore store, TimeProvider clock, KingMetrics metrics, CancellationToken cancellationToken)
    {
        metrics.SightingLogged();
        return Log(KingEventKind.Seen, request.ReporterKey, request.ReporterName, foods: [], store, clock, cancellationToken);
    }

    private static async Task<Created<EventView>> Log(
        KingEventKind kind, string reporterKey, string? reporterName, IReadOnlyList<Food> foods,
        IKingEventStore store, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var kingEvent = new KingEvent(Guid.CreateVersion7(now).ToString(), kind, now, reporterKey, reporterName, foods);
        await store.AddAsync(kingEvent, cancellationToken);
        return TypedResults.Created($"/api/king/events/{kingEvent.Id}", EventView.From(kingEvent));
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
