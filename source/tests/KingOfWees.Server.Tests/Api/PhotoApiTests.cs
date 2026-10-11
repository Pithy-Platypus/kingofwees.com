using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.Photos;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace KingOfWees.Server.Tests.Api;

// Posting photos: on one's own entry (sightings and seen feedings), or shared on their own; undo removes them.
public sealed class PhotoApiTests : IAsyncLifetime
{
    private const string DeviceKey = "device-key-1";
    private const string ReporterKeyHeader = "X-Reporter-Key";

    private readonly KingApiFactory _factory = new();
    private HttpClient _client = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        _client = _factory.CreateClient();
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    private static IEnumerable<string?> ErrorCodes(JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());

    private static ByteArrayContent Jpeg(byte[] bytes)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return content;
    }

    private static MultipartFormDataContent Files(byte[]? photo, byte[]? thumbnail)
    {
        var form = new MultipartFormDataContent();
        if (photo is not null) form.Add(Jpeg(photo), "photo", "photo.jpg");
        if (thumbnail is not null) form.Add(Jpeg(thumbnail), "thumbnail", "thumbnail.jpg");
        return form;
    }

    private Task<HttpResponseMessage> AddPhoto(string eventId, MultipartFormDataContent form, string key = DeviceKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/king/events/{eventId}/photo") { Content = form };
        request.Headers.Add(ReporterKeyHeader, key);
        return _client.SendAsync(request, Ct);
    }

    private Task<HttpResponseMessage> AddPhoto(string eventId, string key = DeviceKey) =>
        AddPhoto(eventId, Files(TestJpeg.Make(withExif: true), TestJpeg.Make(32, withExif: true)), key);

    private Task<HttpResponseMessage> SharePhoto(string? reporterKey = DeviceKey, string? reporterName = "Sarah", byte[]? photo = null)
    {
        var form = Files(photo ?? TestJpeg.Make(withExif: true), TestJpeg.Make(32, withExif: true));
        if (reporterKey is not null) form.Add(new StringContent(reporterKey), "reporterKey");
        if (reporterName is not null) form.Add(new StringContent(reporterName), "reporterName");
        return _client.PostAsync("/api/king/photos", form, Ct);
    }

    private Task<HttpResponseMessage> DeletePhoto(string id, string key = DeviceKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/king/photos/{id}");
        request.Headers.Add(ReporterKeyHeader, key);
        return _client.SendAsync(request, Ct);
    }

    private async Task<string> Logged(string path, object body) =>
        (await Json(await _client.PostAsJsonAsync(path, body, Ct))).GetProperty("id").GetString()!;

    private Task<string> LoggedSighting() => Logged("/api/king/sightings", new { reporterKey = DeviceKey, reporterName = "Sarah" });

    private async Task<byte[]?> StoredFile(string name)
    {
        var stream = await _factory.PhotoFiles.OpenAsync(name, Ct);
        if (stream is null) return null;
        using var copy = new MemoryStream();
        await stream.CopyToAsync(copy, Ct);
        return copy.ToArray();
    }

    [Fact]
    public async Task A_photo_on_one_s_own_sighting_is_stored_without_its_metadata()
    {
        var sightingId = await LoggedSighting();

        var response = await AddPhoto(sightingId);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var view = await Json(response);
        var id = view.GetProperty("id").GetString()!;
        Assert.Equal(sightingId, view.GetProperty("event").GetProperty("id").GetString());
        Assert.Equal("Sarah", view.GetProperty("reporterName").GetString());
        Assert.Equal(new Photo(id, sightingId, _factory.Clock.GetUtcNow(), DeviceKey, "Sarah"), await _factory.Photos.FindAsync(id, Ct));
        Assert.Equal(TestJpeg.Make(), await StoredFile(PhotoFiles.Full(id)));
        Assert.Equal(TestJpeg.Make(32), await StoredFile(PhotoFiles.Thumbnail(id)));
        Assert.DoesNotContain(TestJpeg.GpsText, Encoding.ASCII.GetString((await StoredFile(PhotoFiles.Full(id)))!));
    }

    [Fact]
    public async Task A_feeding_where_King_was_seen_takes_a_photo_but_a_left_out_one_does_not()
    {
        var seen = await Logged("/api/king/feedings", new { reporterKey = DeviceKey, foods = new[] { "wet" } });
        var leftOut = await Logged("/api/king/feedings", new { reporterKey = DeviceKey, sawKing = false });

        Assert.Equal(HttpStatusCode.Created, (await AddPhoto(seen)).StatusCode);
        var refused = await AddPhoto(leftOut);

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("photo.leftOut", (await Json(refused)).GetProperty("type").GetString());
        Assert.Null(await _factory.Photos.FindByEventAsync(leftOut, Ct));
    }

    [Fact]
    public async Task Only_the_device_that_logged_an_entry_can_add_its_photo_and_an_unknown_entry_is_404()
    {
        var sightingId = await LoggedSighting();

        Assert.Equal(HttpStatusCode.NotFound, (await AddPhoto(sightingId, key: "someone-else")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AddPhoto(Guid.CreateVersion7().ToString())).StatusCode);
        Assert.Null(await _factory.Photos.FindByEventAsync(sightingId, Ct));
    }

    [Fact]
    public async Task A_photo_can_be_added_only_within_the_undo_window()
    {
        var sightingId = await LoggedSighting();
        _factory.Clock.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));

        var response = await AddPhoto(sightingId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("undo.expired", (await Json(response)).GetProperty("type").GetString());
    }

    [Fact]
    public async Task An_entry_takes_one_photo()
    {
        var sightingId = await LoggedSighting();
        await AddPhoto(sightingId);

        var second = await AddPhoto(sightingId);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("photo.exists", (await Json(second)).GetProperty("type").GetString());
    }

    [Theory]
    [InlineData("photo missing", "photo.required")]
    [InlineData("thumbnail missing", "thumbnail.required")]
    [InlineData("photo not a jpeg", "photo.notJpeg")]
    [InlineData("thumbnail not a jpeg", "thumbnail.notJpeg")]
    [InlineData("photo too large", "photo.tooLarge")]
    [InlineData("thumbnail too large", "thumbnail.tooLarge")]
    public async Task Files_must_be_whole_jpegs_within_their_size(string shape, string code)
    {
        var sightingId = await LoggedSighting();
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        var form = shape switch
        {
            "photo missing" => Files(null, TestJpeg.Make()),
            "thumbnail missing" => Files(TestJpeg.Make(), null),
            "photo not a jpeg" => Files(png, TestJpeg.Make()),
            "thumbnail not a jpeg" => Files(TestJpeg.Make(), png),
            "photo too large" => Files(TestJpeg.Make(PhotoRules.MaxPhotoBytes + 1), TestJpeg.Make()),
            "thumbnail too large" => Files(TestJpeg.Make(), TestJpeg.Make(PhotoRules.MaxThumbnailBytes + 1)),
            _ => throw new ArgumentOutOfRangeException(nameof(shape)),
        };

        var response = await AddPhoto(sightingId, form);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([code], ErrorCodes(await Json(response)));
        Assert.Null(await _factory.Photos.FindByEventAsync(sightingId, Ct));
    }

    [Fact]
    public async Task Files_at_the_size_limits_are_accepted()
    {
        var sightingId = await LoggedSighting();

        var response = await AddPhoto(sightingId, Files(TestJpeg.Make(PhotoRules.MaxPhotoBytes), TestJpeg.Make(PhotoRules.MaxThumbnailBytes)));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // Kestrel answers 413 before reading a body over the request limit (checked by hand: 5 MB → 413). The test server
    // doesn't enforce request limits, so this checks that both uploads carry them.
    [Fact]
    public void Uploads_carry_body_size_limits_so_an_oversized_body_is_never_read()
    {
        var uploads = _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText is "/api/king/events/{id}/photo" or "/api/king/photos")
            .Where(e => e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("POST") == true)
            .ToList();

        Assert.Equal(2, uploads.Count);
        Assert.All(uploads, e =>
        {
            Assert.Equal(PhotoRules.MaxRequestBytes, e.Metadata.GetMetadata<IRequestSizeLimitMetadata>()?.MaxRequestBodySize);
            Assert.Equal(PhotoRules.MaxRequestBytes, e.Metadata.GetMetadata<IFormOptionsMetadata>()?.MultipartBodyLengthLimit);
        });
    }

    [Fact]
    public async Task A_shared_photo_belongs_to_no_entry_and_is_stored_without_its_metadata()
    {
        var response = await SharePhoto();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var view = await Json(response);
        var id = view.GetProperty("id").GetString()!;
        Assert.Equal(JsonValueKind.Null, view.GetProperty("event").ValueKind);
        Assert.Equal("Sarah", view.GetProperty("reporterName").GetString());
        Assert.Equal(new Photo(id, null, _factory.Clock.GetUtcNow(), DeviceKey, "Sarah"), await _factory.Photos.FindAsync(id, Ct));
        Assert.Equal(TestJpeg.Make(), await StoredFile(PhotoFiles.Full(id)));
        Assert.Equal(TestJpeg.Make(32), await StoredFile(PhotoFiles.Thumbnail(id)));
        Assert.False(view.TryGetProperty("reporterKey", out _));
    }

    [Fact]
    public async Task A_shared_photo_is_never_a_sighting()
    {
        await SharePhoto();

        var status = await _client.GetFromJsonAsync<JsonElement>("/api/king/status", Ct);
        Assert.Equal(JsonValueKind.Null, status.GetProperty("lastSeen").ValueKind);
        Assert.Empty(status.GetProperty("recent").EnumerateArray());
    }

    [Theory]
    [InlineData(null, "Sarah", "reporterKey.required")]
    [InlineData("k", "a name that is far longer than forty characters", "reporterName.tooLong")]
    public async Task A_shared_photo_needs_a_device_key_and_a_short_name(string? reporterKey, string? reporterName, string code)
    {
        var response = await SharePhoto(reporterKey, reporterName);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([code], ErrorCodes(await Json(response)));
    }

    [Fact]
    public async Task A_shared_photo_must_be_a_jpeg()
    {
        var response = await SharePhoto(photo: [0x89, 0x50, 0x4E, 0x47]);

        Assert.Equal(["photo.notJpeg"], ErrorCodes(await Json(response)));
    }

    [Fact]
    public async Task One_s_own_photo_can_be_deleted_within_ten_minutes_with_its_files()
    {
        var id = (await Json(await SharePhoto())).GetProperty("id").GetString()!;

        Assert.Equal(HttpStatusCode.NotFound, (await DeletePhoto(id, key: "someone-else")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await DeletePhoto(id)).StatusCode);

        Assert.Null(await _factory.Photos.FindAsync(id, Ct));
        Assert.Null(await StoredFile(PhotoFiles.Full(id)));
        Assert.Null(await StoredFile(PhotoFiles.Thumbnail(id)));
        Assert.Equal(HttpStatusCode.NotFound, (await DeletePhoto(id)).StatusCode);
    }

    [Fact]
    public async Task A_photo_can_t_be_deleted_after_ten_minutes()
    {
        var id = (await Json(await SharePhoto())).GetProperty("id").GetString()!;
        _factory.Clock.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));

        var response = await DeletePhoto(id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.NotNull(await _factory.Photos.FindAsync(id, Ct));
    }

    [Fact]
    public async Task Undoing_an_entry_deletes_its_photo_and_files()
    {
        var sightingId = await LoggedSighting();
        var id = (await Json(await AddPhoto(sightingId))).GetProperty("id").GetString()!;
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/king/events/{sightingId}");
        request.Headers.Add(ReporterKeyHeader, DeviceKey);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.SendAsync(request, Ct)).StatusCode);

        Assert.Null(await _factory.Photos.FindAsync(id, Ct));
        Assert.Null(await StoredFile(PhotoFiles.Full(id)));
        Assert.Null(await StoredFile(PhotoFiles.Thumbnail(id)));
    }

    [Fact]
    public async Task Photos_are_counted_by_kind_with_nothing_identifying()
    {
        var meterFactory = _factory.Services.GetRequiredService<IMeterFactory>();
        using var photos = new MetricCollector<long>(meterFactory, "KingOfWees", "king.photos");

        await AddPhoto(await LoggedSighting());
        await AddPhoto(await Logged("/api/king/feedings", new { reporterKey = DeviceKey }));
        await SharePhoto();

        Assert.Equal(["sighting", "feeding", "shared"], photos.GetMeasurementSnapshot().Select(m => m.Tags["kind"]));
        Assert.All(photos.GetMeasurementSnapshot(), m => Assert.Equal(["kind"], m.Tags.Keys));
    }

    [Fact]
    public void The_server_won_t_start_without_photo_storage()
    {
        using var factory = new KingApiFactory(settings: [("ConnectionStrings:photos", "")]);

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("ConnectionStrings:photos", error.ToString());
    }
}
