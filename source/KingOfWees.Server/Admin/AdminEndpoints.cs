using KingOfWees.Server.King;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.Admin;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder routes)
    {
        // Authorization runs before any filter, so "no key configured" can only be a 404 by not mapping the routes:
        // /api/admin/* then falls through to the API's 404 fallback.
        if (!routes.ServiceProvider.GetRequiredService<IOptions<AdminOptions>>().Value.IsConfigured)
        {
            return routes;
        }

        var admin = routes.MapGroup("/api/admin")
            .AddEndpointFilter<ValidationFilter>()
            .RequireAuthorization(AdminPolicies.Admin)
            .RequireRateLimiting(AdminPolicies.Requests);
        admin.MapGet("/check", () => TypedResults.NoContent());
        admin.MapPost("/events/{id}/hide", HideEntry);
        admin.MapDelete("/events/{id}/hide", UnhideEntry);
        admin.MapGet("/events/{id}/device", DescribeDevice);
        admin.MapPost("/events/{id}/hide-device", HideDevice);
        admin.MapGet("/hidden-entries", ListHiddenEntries);
        admin.MapGet("/hidden", ListHiddenDevices);
        admin.MapDelete("/hidden/{id}", RestoreDevice);

        return routes;
    }

    private static async Task<Results<NoContent, NotFound>> HideEntry(
        string id, IKingEventStore store, KingMetrics metrics, CancellationToken cancellationToken)
    {
        if (!await store.SetHiddenAsync(id, hidden: true, cancellationToken)) return TypedResults.NotFound();
        metrics.Hidden("entry");
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> UnhideEntry(
        string id, IKingEventStore store, KingMetrics metrics, CancellationToken cancellationToken)
    {
        if (!await store.SetHiddenAsync(id, hidden: false, cancellationToken)) return TypedResults.NotFound();
        metrics.Restored("entry");
        return TypedResults.NoContent();
    }

    // What "hide everything from this poster" would hide, for the confirmation.
    private static async Task<Results<Ok<DeviceView>, NotFound>> DescribeDevice(
        string id, IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var kingEvent = await store.FindAsync(id, cancellationToken);
        if (kingEvent is null) return TypedResults.NotFound();
        return TypedResults.Ok(DeviceView.From(
            await store.SummarizeReporterAsync(kingEvent.ReporterKey, cancellationToken),
            await spots.CountByReporterAsync(kingEvent.ReporterKey, cancellationToken)));
    }

    private static async Task<Results<Ok<HiddenDeviceView>, NotFound>> HideDevice(
        string id, IKingEventStore store, ISpotStore spots, IHiddenReporterStore hidden, TimeProvider clock, KingMetrics metrics,
        CancellationToken cancellationToken)
    {
        var kingEvent = await store.FindAsync(id, cancellationToken);
        if (kingEvent is null) return TypedResults.NotFound();
        var record = await hidden.HideAsync(kingEvent.ReporterKey, clock.GetUtcNow(), cancellationToken);
        metrics.Hidden("device");
        return TypedResults.Ok(await View(record, store, spots, cancellationToken));
    }

    private static async Task<Ok<EventView[]>> ListHiddenEntries(
        IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var view = await KingEndpoints.EventViews(spots, cancellationToken);
        return TypedResults.Ok((await store.GetHiddenEntriesAsync(cancellationToken)).Select(view).ToArray());
    }

    // A handful of hidden devices at most, so a summary each is fine.
    private static async Task<Ok<HiddenDeviceView[]>> ListHiddenDevices(
        IKingEventStore store, ISpotStore spots, IHiddenReporterStore hidden, CancellationToken cancellationToken)
    {
        var views = new List<HiddenDeviceView>();
        foreach (var record in await hidden.ListAsync(cancellationToken))
        {
            views.Add(await View(record, store, spots, cancellationToken));
        }
        return TypedResults.Ok(views.ToArray());
    }

    private static async Task<Results<NoContent, NotFound>> RestoreDevice(
        string id, IHiddenReporterStore hidden, KingMetrics metrics, CancellationToken cancellationToken)
    {
        if (!await hidden.RestoreAsync(id, cancellationToken)) return TypedResults.NotFound();
        metrics.Restored("device");
        return TypedResults.NoContent();
    }

    private static async Task<HiddenDeviceView> View(
        HiddenReporter record, IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var device = DeviceView.From(
            await store.SummarizeReporterAsync(record.ReporterKey, cancellationToken),
            await spots.CountByReporterAsync(record.ReporterKey, cancellationToken));
        return new(record.Id, record.HiddenAt, device.Entries, device.Spots, device.ReporterName, device.NewestAt);
    }
}
