using FluentValidation;
using KingOfWees.Server.King;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.Mvc;

namespace KingOfWees.Server.Photos;

// Multipart forms: the browser sends a resized photo and its thumbnail, both JPEG. The device key travels in
// X-Reporter-Key, as for undo: any site can make a browser post a form, but a custom header makes it ask first, and
// with no CORS policy the answer is no. A key in a form field would let other sites post through visitors' addresses.
// Properties, not constructor parameters: form binding treats every constructor parameter as required (a missing one
// is a 400 with no error codes, before the US check runs), while a missing property binds as null for the validator.
public sealed record AddPhotoForm
{
    public IFormFile? Photo { get; init; }
    public IFormFile? Thumbnail { get; init; }
}

// Bound with [AsParameters]: the key from the header, the rest from the form.
public sealed record SharePhotoForm
{
    [FromHeader(Name = KingEndpoints.ReporterKeyHeader)]
    public string? ReporterKey { get; init; }

    [FromForm]
    public string? ReporterName { get; init; }

    [FromForm]
    public IFormFile? Photo { get; init; }

    [FromForm]
    public IFormFile? Thumbnail { get; init; }

    public string? CleanReporterName => DisplayText.Clean(ReporterName);
}

// Event is the entry the photo belongs to, or null for a shared photo. Never the device key.
public sealed record PhotoView(string Id, DateTimeOffset PostedAt, string? ReporterName, EventView? Event);

// Bound from the query string with [AsParameters]; Before is the id of the last photo already shown.
public sealed record PhotosQuery(string? Before, int? Limit)
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 100;
}

public sealed record PhotosPage(IReadOnlyList<PhotoView> Photos, string? Next);

// Endpoint metadata on both uploads (WithPhotoUploadLimits): what the uploads-at-once limit (KingServices) applies to.
public sealed class PhotoUploadEndpoint
{
    public static readonly PhotoUploadEndpoint Instance = new();

    private PhotoUploadEndpoint()
    {
    }
}

public static class PhotoFiles
{
    public static string Full(string id) => $"{id}.jpg";

    public static string Thumbnail(string id) => $"{id}-thumb.jpg";
}

public static class PhotoRules
{
    public const int MaxPhotoBytes = 1024 * 1024;
    public const int MaxThumbnailBytes = 100 * 1024;

    // Both files plus room for the form's boundaries, headers and fields.
    public const int MaxRequestBytes = MaxPhotoBytes + MaxThumbnailBytes + 64 * 1024;

    public static async Task<byte[]> ReadAllAsync(IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        using var copy = new MemoryStream((int)file.Length);
        await stream.CopyToAsync(copy, cancellationToken);
        return copy.ToArray();
    }

    // Codes "<field>.required", "<field>.tooLarge", "<field>.notJpeg"; the first that fails is the only one reported.
    public static void ValidJpeg<T>(this IRuleBuilderInitial<T, IFormFile?> rule, string field, int maxBytes) =>
        rule.Cascade(CascadeMode.Stop)
            .NotNull().WithErrorCode($"{field}.required")
            .Must(f => f!.Length <= maxBytes).WithErrorCode($"{field}.tooLarge")
            .MustAsync(async (f, ct) => JpegMetadata.Strip(await ReadAllAsync(f!, ct)) is not null).WithErrorCode($"{field}.notJpeg");
}

public sealed class AddPhotoFormValidator : AbstractValidator<AddPhotoForm>
{
    public AddPhotoFormValidator()
    {
        RuleFor(f => f.Photo).ValidJpeg("photo", PhotoRules.MaxPhotoBytes);
        RuleFor(f => f.Thumbnail).ValidJpeg("thumbnail", PhotoRules.MaxThumbnailBytes);
    }
}

public sealed class PhotosQueryValidator : AbstractValidator<PhotosQuery>
{
    public PhotosQueryValidator(IPhotoStore photos)
    {
        RuleFor(q => q.Limit).InclusiveBetween(1, PhotosQuery.MaxLimit).WithErrorCode("limit.outOfRange");
        RuleFor(q => q.Before)
            .MustAsync(async (id, ct) => await photos.FindAsync(id!, ct) is not null)
            .When(q => q.Before is not null)
            .WithErrorCode("before.unknown");
    }
}

public sealed class SharePhotoFormValidator : AbstractValidator<SharePhotoForm>
{
    public SharePhotoFormValidator()
    {
        RuleFor(f => f.ReporterKey).NotEmpty().WithErrorCode("reporterKey.required")
            .MaximumLength(ReporterRules.MaxKeyLength).WithErrorCode("reporterKey.tooLong");
        RuleFor(f => f.CleanReporterName).ValidReporterName().OverridePropertyName(nameof(SharePhotoForm.ReporterName));
        RuleFor(f => f.Photo).ValidJpeg("photo", PhotoRules.MaxPhotoBytes);
        RuleFor(f => f.Thumbnail).ValidJpeg("thumbnail", PhotoRules.MaxThumbnailBytes);
    }
}
