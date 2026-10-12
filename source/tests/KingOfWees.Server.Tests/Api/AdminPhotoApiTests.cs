using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Admin;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.Photos;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace KingOfWees.Server.Tests.Api;

// Admins hide a photo on its own (its entry stays) and show it again; never delete it. Recorded in the audit log.
public sealed class AdminPhotoApiTests : IAsyncLifetime
{
    private const string AdminKey = "test-admin-key";
    private const string Neighbor = "neighbor-device-key";

    private readonly KingApiFactory _factory = new(settings: [("King:Admin:KeyHash", AdminKeyHasher.Hash(AdminKey))]);
    private HttpClient _public = null!;
    private HttpClient _admin = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        _public = _factory.CreateClient();
        _admin = _factory.CreateClient();
        _admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", AdminKey);
        _admin.DefaultRequestHeaders.Add(AdminAudit.NameHeader, "Wallie");
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private async Task<KingEvent> Sighting()
    {
        var response = await _public.PostAsJsonAsync("/api/king/sightings", new { reporterKey = Neighbor, reporterName = "Sarah" }, Ct);
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString()!;
        return (await _factory.Store.FindAsync(id, Ct))!;
    }

    private async Task<Photo> Stored(string? eventId = null)
    {
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        var photo = new Photo(Guid.CreateVersion7().ToString(), eventId, _factory.Clock.GetUtcNow(), Neighbor, "Sarah");
        await _factory.PhotoFiles.PutAsync(PhotoFiles.Full(photo.Id), new MemoryStream(TestJpeg.Make()), Ct);
        await _factory.PhotoFiles.PutAsync(PhotoFiles.Thumbnail(photo.Id), new MemoryStream(TestJpeg.Make(32)), Ct);
        await _factory.Photos.AddAsync(photo, Ct);
        return photo;
    }

    private Task<HttpResponseMessage> Hide(string id) => _admin.PostAsync($"/api/admin/photos/{id}/hide", null, Ct);

    private Task<HttpResponseMessage> Show(string id) => _admin.DeleteAsync($"/api/admin/photos/{id}/hide", Ct);

    private async Task<HttpStatusCode> Served(string id) => (await _public.GetAsync($"/api/king/photos/{id}/full", Ct)).StatusCode;

    private async Task<string?[]> HiddenIds() =>
        [.. (await _admin.GetFromJsonAsync<JsonElement>("/api/admin/hidden-photos", Ct)).EnumerateArray()
            .Select(p => p.GetProperty("id").GetString())];

    private async Task<AdminLogRecord> LatestRecord() => (await _factory.AdminLog.GetPageAsync(null, 1, Ct)).Single();

    [Fact]
    public async Task A_hidden_photo_leaves_everywhere_but_its_entry_stays_and_it_can_be_shown_again()
    {
        var entry = await Sighting();
        var photo = await Stored(eventId: entry.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await Hide(photo.Id)).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, await Served(photo.Id));
        var lastSeen = (await _public.GetFromJsonAsync<JsonElement>("/api/king/status", Ct)).GetProperty("lastSeen");
        Assert.Equal(entry.Id, lastSeen.GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.Null, lastSeen.GetProperty("photoId").ValueKind);
        Assert.Equal([photo.Id], await HiddenIds());

        Assert.Equal(HttpStatusCode.NoContent, (await Show(photo.Id)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, await Served(photo.Id));
        Assert.Empty(await HiddenIds());
    }

    [Fact]
    public async Task Hiding_keeps_the_files_so_the_photo_can_come_back()
    {
        var photo = await Stored();

        await Hide(photo.Id);

        Assert.NotNull(await _factory.PhotoFiles.OpenAsync(PhotoFiles.Full(photo.Id), Ct));
        Assert.NotNull(await _factory.PhotoFiles.OpenAsync(PhotoFiles.Thumbnail(photo.Id), Ct));
        Assert.NotNull(await _factory.Photos.FindAsync(photo.Id, Ct));
    }

    [Fact]
    public async Task An_unknown_photo_is_404_and_nothing_is_recorded()
    {
        var unknown = Guid.CreateVersion7().ToString();

        Assert.Equal(HttpStatusCode.NotFound, (await Hide(unknown)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Show(unknown)).StatusCode);
        Assert.Empty(await _factory.AdminLog.GetPageAsync(null, 10, Ct));
    }

    [Fact]
    public async Task The_hidden_list_shows_each_photo_with_its_entry_and_never_a_device_key()
    {
        var entry = await Sighting();
        var onEntry = await Stored(eventId: entry.Id);
        var shared = await Stored();
        await Hide(onEntry.Id);
        await Hide(shared.Id);

        var list = await _admin.GetFromJsonAsync<JsonElement>("/api/admin/hidden-photos", Ct);

        var photos = list.EnumerateArray().ToList();
        Assert.Equal([shared.Id, onEntry.Id], photos.Select(p => p.GetProperty("id").GetString()));
        Assert.Equal(JsonValueKind.Null, photos[0].GetProperty("event").ValueKind);
        Assert.Equal(entry.Id, photos[1].GetProperty("event").GetProperty("id").GetString());
        Assert.Equal("Sarah", photos[1].GetProperty("reporterName").GetString());
        Assert.DoesNotContain(Neighbor, list.GetRawText());
    }

    [Fact]
    public async Task Hiding_and_showing_a_photo_on_an_entry_is_recorded_in_words()
    {
        var entry = await Sighting();
        var photo = await Stored(eventId: entry.Id);

        await Hide(photo.Id);
        var hid = await LatestRecord();
        _factory.Clock.Advance(TimeSpan.FromSeconds(1)); // records in one instant are ordered by random id bits
        await Show(photo.Id);
        var showed = await LatestRecord();

        Assert.Equal(AdminAction.HidePhoto, hid.Action);
        Assert.Equal(AdminAction.ShowPhoto, showed.Action);
        Assert.Equal("Wallie", hid.AdminName);
        var expected = new AdminTouched(PosterName: "Sarah", EntryKind: KingEventKind.Seen, EntryAt: entry.OccurredAt);
        Assert.Equal(expected, hid.Touched);
        Assert.Equal(expected, showed.Touched);
    }

    [Fact]
    public async Task Hiding_a_shared_photo_is_recorded_with_when_it_was_shared()
    {
        var photo = await Stored();

        await Hide(photo.Id);

        Assert.Equal(new AdminTouched(PosterName: "Sarah", EntryAt: photo.PostedAt), (await LatestRecord()).Touched);
    }

    [Fact]
    public async Task Photo_hides_and_restores_are_counted()
    {
        var meterFactory = _factory.Services.GetRequiredService<IMeterFactory>();
        using var hides = new MetricCollector<long>(meterFactory, "KingOfWees", "king.admin.hides");
        using var restores = new MetricCollector<long>(meterFactory, "KingOfWees", "king.admin.restores");
        var photo = await Stored();

        await Hide(photo.Id);
        await Show(photo.Id);

        Assert.Equal("photo", hides.GetMeasurementSnapshot().Single().Tags["target"]);
        Assert.Equal("photo", restores.GetMeasurementSnapshot().Single().Tags["target"]);
    }

    [Theory]
    [InlineData("POST", "/api/admin/photos/x/hide")]
    [InlineData("DELETE", "/api/admin/photos/x/hide")]
    [InlineData("GET", "/api/admin/hidden-photos")]
    public async Task Every_photo_admin_route_needs_the_key(string method, string path)
    {
        var response = await _public.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
