using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
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
        admin.MapGet("/check", SignIn);
        admin.MapPost("/events/{id}/hide", HideEntry);
        admin.MapDelete("/events/{id}/hide", UnhideEntry);
        admin.MapGet("/events/{id}/device", DescribeDevice);
        admin.MapPost("/events/{id}/hide-device", HideDevice);
        admin.MapGet("/hidden-entries", ListHiddenEntries);
        admin.MapGet("/hidden", ListHiddenDevices);
        admin.MapDelete("/hidden/{id}", RestoreDevice);
        admin.MapGet("/spots", ListSpots);
        admin.MapPost("/spots/rename", RenameSpot);
        admin.MapPost("/spots/merge", MergeSpots);
        admin.MapGet("/activity", GetActivity);
        admin.MapPost("/photos/{id}/hide", HidePhoto);
        admin.MapDelete("/photos/{id}/hide", ShowPhoto);
        admin.MapGet("/hidden-photos", ListHiddenPhotos);

        return routes;
    }

    // The page checks the key only when someone signs in, so a good check is the sign-in.
    private static async Task<NoContent> SignIn(HttpContext context, AdminAudit audit, CancellationToken cancellationToken)
    {
        await audit.RecordAsync(context, AdminAction.SignIn, new(), cancellationToken);
        return TypedResults.NoContent();
    }

    private static Task<Results<NoContent, NotFound>> HideEntry(
        string id, IKingEventStore store, ISpotStore spots, AdminAudit audit, KingMetrics metrics, HttpContext context,
        CancellationToken cancellationToken) =>
        SetEntryHidden(id, hidden: true, store, spots, audit, metrics, context, cancellationToken);

    private static Task<Results<NoContent, NotFound>> UnhideEntry(
        string id, IKingEventStore store, ISpotStore spots, AdminAudit audit, KingMetrics metrics, HttpContext context,
        CancellationToken cancellationToken) =>
        SetEntryHidden(id, hidden: false, store, spots, audit, metrics, context, cancellationToken);

    private static async Task<Results<NoContent, NotFound>> SetEntryHidden(
        string id, bool hidden, IKingEventStore store, ISpotStore spots, AdminAudit audit, KingMetrics metrics,
        HttpContext context, CancellationToken cancellationToken)
    {
        var entry = await store.FindAsync(id, cancellationToken);
        if (entry is null || !await store.SetHiddenAsync(id, hidden, cancellationToken)) return TypedResults.NotFound();
        if (hidden) metrics.Hidden("entry");
        else metrics.Restored("entry");
        var spot = entry.SpotId is null ? null : await spots.FindAsync(entry.SpotId, cancellationToken);
        await audit.RecordAsync(
            context, hidden ? AdminAction.HideEntry : AdminAction.ShowEntry, AdminAudit.Entry(entry, spot), cancellationToken);
        return TypedResults.NoContent();
    }

    // A photo on its own: its entry stays. Hidden, never deleted — the files stay, so it can be shown again (and a photo
    // reported to NCMEC must be kept a year).
    // Hidden with why, when and the typed name, so a later admin knows which photo this is without seeing it again.
    private static async Task<Results<NoContent, NotFound>> HidePhoto(
        string id, HidePhotoRequest request, IPhotoStore photos, IKingEventStore store, ISpotStore spots, AdminAudit audit,
        KingMetrics metrics, TimeProvider clock, HttpContext context, CancellationToken cancellationToken)
    {
        var photo = await photos.FindAsync(id, cancellationToken);
        var hiding = new PhotoHiding(request.ParsedReason, request.CleanNote, clock.GetUtcNow(), AdminAudit.NameOf(context.Request));
        if (photo is null || !await photos.HideAsync(id, hiding, cancellationToken)) return TypedResults.NotFound();
        metrics.Hidden("photo");
        var touched = await Described(photo, store, spots, cancellationToken) with { Reason = hiding.Reason, Note = hiding.Note };
        await audit.RecordAsync(context, AdminAction.HidePhoto, touched, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> ShowPhoto(
        string id, IPhotoStore photos, IKingEventStore store, ISpotStore spots, AdminAudit audit, KingMetrics metrics,
        HttpContext context, CancellationToken cancellationToken)
    {
        var photo = await photos.FindAsync(id, cancellationToken);
        if (photo is null || !await photos.ShowAsync(id, cancellationToken)) return TypedResults.NotFound();
        metrics.Restored("photo");
        await audit.RecordAsync(context, AdminAction.ShowPhoto, await Described(photo, store, spots, cancellationToken), cancellationToken);
        return TypedResults.NoContent();
    }

    // A photo on an entry is described like the entry; a shared photo by who shared it and when.
    private static async Task<AdminTouched> Described(Photo photo, IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var entry = photo.EventId is null ? null : await store.FindAsync(photo.EventId, cancellationToken);
        var spot = entry?.SpotId is null ? null : await spots.FindAsync(entry.SpotId, cancellationToken);
        return entry is null ? new AdminTouched(PosterName: photo.ReporterName, EntryAt: photo.PostedAt) : AdminAudit.Entry(entry, spot);
    }

    private static async Task<Ok<IReadOnlyList<HiddenPhotoView>>> ListHiddenPhotos(
        IPhotoStore photos, IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var hidden = await photos.GetHiddenAsync(cancellationToken);
        var views = await PhotoEndpoints.PhotoViews(hidden, store, spots, photos, cancellationToken);
        var hidings = hidden.ToDictionary(p => p.Id, p => p.Hiding);
        return TypedResults.Ok<IReadOnlyList<HiddenPhotoView>>(
        [
            .. views.Select(v => new HiddenPhotoView(v.Id, v.PostedAt, v.ReporterName, v.Event,
                hidings[v.Id] is { } h ? new HidingView(h.Reason, h.Note, h.At, h.AdminName) : null)),
        ]);
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
        AdminAudit audit, HttpContext context, CancellationToken cancellationToken)
    {
        var kingEvent = await store.FindAsync(id, cancellationToken);
        if (kingEvent is null) return TypedResults.NotFound();
        var record = await hidden.HideAsync(kingEvent.ReporterKey, clock.GetUtcNow(), cancellationToken);
        metrics.Hidden("device");
        var view = await View(record, store, spots, cancellationToken);
        await audit.RecordAsync(context, AdminAction.HidePoster, Poster(view), cancellationToken);
        return TypedResults.Ok(view);
    }

    private static async Task<Ok<AdminSpotView[]>> ListSpots(
        ISpotStore spots, IKingEventStore store, IHiddenReporterStore hidden, CancellationToken cancellationToken)
    {
        var hiddenKeys = (await hidden.ListAsync(cancellationToken)).Select(h => h.ReporterKey).ToHashSet();
        var feedings = (await store.CountEveryFeedingBySpotAsync(cancellationToken)).ToDictionary(c => c.SpotId, c => c.Count);
        return TypedResults.Ok((await spots.ListEveryAsync(cancellationToken))
            .Select(s => new AdminSpotView(s.Id, s.Name, hiddenKeys.Contains(s.ReporterKey), feedings.GetValueOrDefault(s.Id)))
            .ToArray());
    }

    private static async Task<Results<NoContent, NotFound>> RenameSpot(
        RenameSpotRequest request, ISpotStore spots, KingMetrics metrics, AdminAudit audit, HttpContext context,
        CancellationToken cancellationToken)
    {
        var spot = await spots.FindAsync(request.SpotId, cancellationToken);
        var name = request.CleanName!;
        if (spot is null || !await spots.RenameAsync(request.SpotId, name, cancellationToken)) return TypedResults.NotFound();
        metrics.Renamed("spot");
        await audit.RecordAsync(context, AdminAction.RenamePlace, new(PlaceName: spot.Name, NewName: name), cancellationToken);
        return TypedResults.NoContent();
    }

    // The validator has checked every id. Feedings move before the places are deleted, so none is left pointing at a
    // place that no longer exists. No undo (Wallie's choice): the merged places are gone for good.
    private static async Task<NoContent> MergeSpots(
        MergeSpotsRequest request, ISpotStore spots, IKingEventStore store, KingMetrics metrics, AdminAudit audit,
        HttpContext context, CancellationToken cancellationToken)
    {
        var kept = (await spots.FindAsync(request.KeepId, cancellationToken))!;
        var mergedNames = new List<string>();
        foreach (var id in request.MergeIds)
        {
            mergedNames.Add((await spots.FindAsync(id, cancellationToken))!.Name);
        }
        var moved = await store.MoveFeedingsAsync(request.MergeIds, kept.Id, cancellationToken);
        await spots.DeleteAsync(request.MergeIds, cancellationToken);
        var name = request.CleanName;
        if (name is not null) await spots.RenameAsync(kept.Id, name, cancellationToken);
        metrics.Merged("spot");
        await audit.RecordAsync(
            context, AdminAction.MergePlaces,
            new(PlaceName: kept.Name, NewName: name, MergedNames: mergedNames, Feedings: moved), cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Ok<ActivityPage>> GetActivity(
        [AsParameters] ActivityQuery query, IAdminLogStore log, CancellationToken cancellationToken)
    {
        var limit = query.Limit ?? HistoryQuery.DefaultLimit;
        // The validator has already checked that the cursor names a record.
        var before = query.Before is null ? null : await log.FindAsync(query.Before, cancellationToken);
        // One extra tells whether an older page exists without a second query.
        var records = await log.GetPageAsync(before, limit + 1, cancellationToken);
        var page = records.Take(limit).ToList();
        return TypedResults.Ok(new ActivityPage(page, records.Count > limit ? page[^1].Id : null));
    }

    private static async Task<Ok<EventView[]>> ListHiddenEntries(
        IKingEventStore store, ISpotStore spots, IPhotoStore photos, CancellationToken cancellationToken)
    {
        var entries = await store.GetHiddenEntriesAsync(cancellationToken);
        var view = await KingEndpoints.EventViews(spots, photos, entries, cancellationToken);
        return TypedResults.Ok(entries.Select(view).ToArray());
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

    // Described before restoring: the record (and with it what the poster posted) is gone afterwards.
    private static async Task<Results<NoContent, NotFound>> RestoreDevice(
        string id, IKingEventStore store, ISpotStore spots, IHiddenReporterStore hidden, KingMetrics metrics, AdminAudit audit,
        HttpContext context, CancellationToken cancellationToken)
    {
        var record = (await hidden.ListAsync(cancellationToken)).FirstOrDefault(h => h.Id == id);
        if (record is null) return TypedResults.NotFound();
        var view = await View(record, store, spots, cancellationToken);
        if (!await hidden.RestoreAsync(id, cancellationToken)) return TypedResults.NotFound();
        metrics.Restored("device");
        await audit.RecordAsync(context, AdminAction.RestorePoster, Poster(view), cancellationToken);
        return TypedResults.NoContent();
    }

    private static AdminTouched Poster(HiddenDeviceView view) =>
        new(PosterName: view.ReporterName, Entries: view.Entries, Spots: view.Spots);

    private static async Task<HiddenDeviceView> View(
        HiddenReporter record, IKingEventStore store, ISpotStore spots, CancellationToken cancellationToken)
    {
        var device = DeviceView.From(
            await store.SummarizeReporterAsync(record.ReporterKey, cancellationToken),
            await spots.CountByReporterAsync(record.ReporterKey, cancellationToken));
        return new(record.Id, record.HiddenAt, device.Entries, device.Spots, device.ReporterName, device.NewestAt);
    }
}
