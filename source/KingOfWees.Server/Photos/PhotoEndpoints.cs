using KingOfWees.Server.King;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace KingOfWees.Server.Photos;

public static class PhotoEndpoints
{
    // Called only on the /api/king writes group (KingEndpoints), which carries CanPost, the write limit and the US check.
    // No antiforgery: the site has no cookies to ride on. The size limits stop an oversized body before it's read.
    public static void MapPhotoWrites(this RouteGroupBuilder writes)
    {
        writes.MapPost("/events/{id}/photo", AddPhoto).WithPhotoUploadLimits();
        writes.MapPost("/photos", SharePhoto).WithPhotoUploadLimits();
        writes.MapDelete("/photos/{id}", DeletePhoto);
    }

    private static RouteHandlerBuilder WithPhotoUploadLimits(this RouteHandlerBuilder endpoint) =>
        endpoint.DisableAntiforgery()
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
        var view = await KingEndpoints.EventViews(spots, cancellationToken);
        return TypedResults.Created((string?)null, new PhotoView(photo.Id, photo.PostedAt, photo.ReporterName, view(kingEvent)));
    }

    // A photo on its own: never an entry, so never a sighting.
    private static async Task<Created<PhotoView>> SharePhoto(
        [FromForm] SharePhotoForm form, IPhotoStore photos, IPhotoBlobStore files, TimeProvider clock, KingMetrics metrics,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var photo = new Photo(Guid.CreateVersion7(now).ToString(), null, now, form.ReporterKey!, form.ReporterName);
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
