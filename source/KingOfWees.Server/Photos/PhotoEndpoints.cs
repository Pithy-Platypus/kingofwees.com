using KingOfWees.Server.King;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace KingOfWees.Server.Photos;

public static class PhotoEndpoints
{
    // Reads: no device key needed, open to every country.
    public static void MapPhotoReads(this RouteGroupBuilder king)
    {
        king.MapGet("/photos", ListPhotos);
        king.MapGet("/photos/{id}/full", (string id, IPhotoStore photos, IPhotoBlobStore files, HttpContext context, CancellationToken ct) =>
            ServeAsync(id, PhotoFiles.Full(id), photos, files, context, ct)).RequireRateLimiting(KingPolicies.PhotoFiles);
        king.MapGet("/photos/{id}/thumb", (string id, IPhotoStore photos, IPhotoBlobStore files, HttpContext context, CancellationToken ct) =>
            ServeAsync(id, PhotoFiles.Thumbnail(id), photos, files, context, ct)).RequireRateLimiting(KingPolicies.PhotoFiles);
    }

    // Only while visible. Private and an hour at most, so a photo an admin hides leaves everyone's view soon after
    // (a shared cache, should a proxy ever sit in front, keeps nothing).
    private static async Task<Results<FileStreamHttpResult, NotFound>> ServeAsync(
        string id, string fileName, IPhotoStore photos, IPhotoBlobStore files, HttpContext context, CancellationToken cancellationToken)
    {
        if (await photos.FindVisibleAsync(id, cancellationToken) is null
            || await files.OpenAsync(fileName, cancellationToken) is not { } content)
        {
            return TypedResults.NotFound();
        }

        context.Response.Headers.CacheControl = "private, max-age=3600";
        return TypedResults.Stream(content, "image/jpeg");
    }

    private static async Task<Ok<PhotosPage>> ListPhotos(
        [AsParameters] PhotosQuery query, IPhotoStore photos, IKingEventStore events, ISpotStore spots, CancellationToken cancellationToken)
    {
        var limit = query.Limit ?? PhotosQuery.DefaultLimit;
        // The validator has already checked that the cursor names a photo.
        var before = query.Before is null ? null : await photos.FindAsync(query.Before, cancellationToken);
        // One extra tells whether an older page exists without a second query.
        var found = await photos.GetPageAsync(before, limit + 1, cancellationToken);
        var page = found.Take(limit).ToList();
        return TypedResults.Ok(new PhotosPage(
            await PhotoViews(page, events, spots, photos, cancellationToken), found.Count > limit ? page[^1].Id : null));
    }

    // Each photo with its entry, shown as in history. A visible photo's entry is visible too: same device, and a hidden
    // entry hides its photo.
    internal static async Task<IReadOnlyList<PhotoView>> PhotoViews(
        IReadOnlyList<Photo> page, IKingEventStore events, ISpotStore spots, IPhotoStore photos, CancellationToken cancellationToken)
    {
        // One read for the page's entries, not one per photo: up to 100 photos on a public, anonymous page.
        var entries = (await events.FindManyAsync([.. page.Select(p => p.EventId).OfType<string>().Distinct()], cancellationToken))
            .ToDictionary(e => e.Id);
        var view = await KingEndpoints.EventViews(spots, photos, entries.Values, cancellationToken);
        return [.. page.Select(p => new PhotoView(
            p.Id, p.PostedAt, p.ReporterName, p.EventId is { } id && entries.TryGetValue(id, out var entry) ? view(entry) : null))];
    }

    // Called only on the /api/king writes group (KingEndpoints), which carries CanPost, the write limit and the US check.
    // No antiforgery tokens: the site has no cookies to ride on. What stops another site making visitors' browsers post
    // here (through their US addresses) is the X-Reporter-Key header both uploads require. The size limits stop an
    // oversized body before it's read.
    public static void MapPhotoWrites(this RouteGroupBuilder writes)
    {
        writes.MapPost("/events/{id}/photo", AddPhoto).WithPhotoUploadLimits();
        writes.MapPost("/photos", SharePhoto).WithPhotoUploadLimits();
        writes.MapDelete("/photos/{id}", DeletePhoto);
    }

    private static RouteHandlerBuilder WithPhotoUploadLimits(this RouteHandlerBuilder endpoint) =>
        endpoint.DisableAntiforgery()
            .WithMetadata(PhotoUploadEndpoint.Instance)
            .WithMetadata(new RequestSizeLimitAttribute(PhotoRules.MaxRequestBytes))
            .WithFormOptions(multipartBodyLengthLimit: PhotoRules.MaxRequestBytes);

    // A photo on one's own entry, within the undo window: sightings and feedings where King was seen; one per entry.
    private static async Task<Results<Created<PhotoView>, NotFound, ProblemHttpResult>> AddPhoto(
        string id, [FromForm] AddPhotoForm form, [FromHeader(Name = KingEndpoints.ReporterKeyHeader)] string reporterKey,
        IKingEventStore events, ISpotStore spots, IPhotoStore photos, IPhotoBlobStore files, TimeProvider clock,
        KingMetrics metrics, CancellationToken cancellationToken)
    {
        var kingEvent = await events.FindAsync(id, cancellationToken);
        switch (KingEndpoints.CheckOwnRecent(kingEvent?.ReporterKey, kingEvent?.OccurredAt, reporterKey, clock))
        {
            case KingEndpoints.OwnRecent.NotFound: return TypedResults.NotFound();
            case KingEndpoints.OwnRecent.Expired: return KingEndpoints.UndoExpired();
        }
        if (!kingEvent!.SawKing)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, type: "photo.leftOut");
        }
        if (await photos.FindByEventAsync(id, cancellationToken) is not null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, type: "photo.exists");
        }

        var now = clock.GetUtcNow();
        var photo = new Photo(Guid.CreateVersion7(now).ToString(), id, now, reporterKey, kingEvent.ReporterName);
        await StoreAsync(photo, form.Photo!, form.Thumbnail!, photos, files, cancellationToken);
        metrics.PhotoPosted(kingEvent.Kind == KingEventKind.Seen ? "sighting" : "feeding");
        var view = await KingEndpoints.EventViews(spots, photos, [kingEvent], cancellationToken);
        return TypedResults.Created((string?)null, new PhotoView(photo.Id, photo.PostedAt, photo.ReporterName, view(kingEvent)));
    }

    // A photo on its own: never an entry, so never a sighting.
    private static async Task<Created<PhotoView>> SharePhoto(
        [AsParameters] SharePhotoForm form, IPhotoStore photos, IPhotoBlobStore files, TimeProvider clock, KingMetrics metrics,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var photo = new Photo(Guid.CreateVersion7(now).ToString(), null, now, form.ReporterKey!, form.CleanReporterName);
        await StoreAsync(photo, form.Photo!, form.Thumbnail!, photos, files, cancellationToken);
        metrics.PhotoPosted("shared");
        return TypedResults.Created((string?)null, new PhotoView(photo.Id, photo.PostedAt, photo.ReporterName, Event: null));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> DeletePhoto(
        string id, [FromHeader(Name = KingEndpoints.ReporterKeyHeader)] string reporterKey,
        IPhotoStore photos, IPhotoBlobStore files, TimeProvider clock, CancellationToken cancellationToken)
    {
        var photo = await photos.FindAsync(id, cancellationToken);
        switch (KingEndpoints.CheckOwnRecent(photo?.ReporterKey, photo?.PostedAt, reporterKey, clock))
        {
            case KingEndpoints.OwnRecent.NotFound: return TypedResults.NotFound();
            case KingEndpoints.OwnRecent.Expired: return KingEndpoints.UndoExpired();
        }

        await DeleteWithFilesAsync(photo!, photos, files, cancellationToken);
        return TypedResults.NoContent();
    }

    // Files first, record last: a record never points at files that aren't there. Only what Strip returns is stored
    // (the validator has already checked that both files are whole JPEGs).
    private static async Task StoreAsync(
        Photo photo, IFormFile full, IFormFile thumbnail, IPhotoStore photos, IPhotoBlobStore files, CancellationToken cancellationToken)
    {
        foreach (var (name, file) in new[] { (PhotoFiles.Full(photo.Id), full), (PhotoFiles.Thumbnail(photo.Id), thumbnail) })
        {
            var stripped = JpegMetadata.Strip(await PhotoRules.ReadAllAsync(file, cancellationToken))!;
            await files.PutAsync(name, new MemoryStream(stripped), cancellationToken);
        }
        await photos.AddAsync(photo, cancellationToken);
    }

    // Record first, files last: a record never points at files that are gone.
    internal static async Task DeleteWithFilesAsync(Photo photo, IPhotoStore photos, IPhotoBlobStore files, CancellationToken cancellationToken)
    {
        await photos.DeleteAsync(photo.Id, cancellationToken);
        await files.DeleteAsync(PhotoFiles.Full(photo.Id), cancellationToken);
        await files.DeleteAsync(PhotoFiles.Thumbnail(photo.Id), cancellationToken);
    }
}
