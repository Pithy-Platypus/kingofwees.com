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

    private Task<HttpResponseMessage> Hide(string id, object? body = null) =>
        _admin.PostAsJsonAsync($"/api/admin/photos/{id}/hide", body ?? new { reason = "notKing" }, Ct);

    private static IEnumerable<string?> ErrorCodes(JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());

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
        var described = new AdminTouched(PosterName: "Sarah", EntryKind: KingEventKind.Seen, EntryAt: entry.OccurredAt);
        Assert.Equal(described with { Reason = HideReason.NotKing }, hid.Touched);
        Assert.Equal(described, showed.Touched);
    }

    [Fact]
    public async Task Hiding_a_shared_photo_is_recorded_with_when_it_was_shared()
    {
        var photo = await Stored();

        await Hide(photo.Id);

        Assert.Equal(new AdminTouched(PosterName: "Sarah", EntryAt: photo.PostedAt, Reason: HideReason.NotKing), (await LatestRecord()).Touched);
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

    public static TheoryData<string, string[]> Unacceptable => new()
    {
        { """{}""", ["reason.required"] },
        { """{"reason":""}""", ["reason.required"] },
        { """{"reason":"sideways"}""", ["reason.unknown"] },
        { """{"reason":"1"}""", ["reason.unknown"] },
        { """{"reason":"NotKing"}""", ["reason.unknown"] },
        { """{"reason":"other"}""", ["note.required"] },
        { """{"reason":"other","note":"   "}""", ["note.required"] },
        { """{"reason":"other","note":"\u200B\u202E"}""", ["note.required"] },
        { $$"""{"reason":"rude","note":"{{new string('x', 201)}}"}""", ["note.tooLong"] },
    };

    [Theory]
    [MemberData(nameof(Unacceptable))]
    public async Task Hiding_needs_a_known_reason_and_a_note_for_other_and_hides_nothing_without_one(string body, string[] codes)
    {
        var photo = await Stored();

        var response = await _admin.PostAsync($"/api/admin/photos/{photo.Id}/hide",
            new StringContent(body, System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(codes, ErrorCodes(await response.Content.ReadFromJsonAsync<JsonElement>(Ct)));
        Assert.Null((await _factory.Photos.FindAsync(photo.Id, Ct))!.Hiding);
        Assert.Equal(HttpStatusCode.OK, await Served(photo.Id));
    }

    [Fact]
    public async Task The_hidden_list_says_why_when_and_who_with_the_note_trimmed()
    {
        var photo = await Stored();
        _factory.Clock.Advance(TimeSpan.FromHours(2));
        var hiddenAt = _factory.Clock.GetUtcNow();

        Assert.Equal(HttpStatusCode.NoContent,
            (await Hide(photo.Id, new { reason = "unlawful", note = "  reported\u200B to NCMEC\u202E  " })).StatusCode);

        var hidden = (await _admin.GetFromJsonAsync<JsonElement>("/api/admin/hidden-photos", Ct))[0].GetProperty("hidden");
        Assert.Equal("unlawful", hidden.GetProperty("reason").GetString());
        Assert.Equal("reported to NCMEC", hidden.GetProperty("note").GetString());
        Assert.Equal(hiddenAt, hidden.GetProperty("at").GetDateTimeOffset());
        Assert.Equal("Wallie", hidden.GetProperty("by").GetString());
    }

    [Theory]
    [InlineData("notKing", null)]
    [InlineData("showsPerson", null)]
    [InlineData("rude", "")]
    [InlineData("other", "a thumb over the lens")]
    public async Task Every_reason_on_the_list_is_accepted_and_an_empty_note_is_no_note(string reason, string? note)
    {
        var photo = await Stored();

        Assert.Equal(HttpStatusCode.NoContent, (await Hide(photo.Id, new { reason, note })).StatusCode);

        var hidden = (await _admin.GetFromJsonAsync<JsonElement>("/api/admin/hidden-photos", Ct))[0].GetProperty("hidden");
        Assert.Equal(reason, hidden.GetProperty("reason").GetString());
        Assert.Equal(string.IsNullOrEmpty(note) ? null : note, hidden.GetProperty("note").GetString());
    }

    [Fact]
    public async Task A_photo_hidden_before_reasons_existed_is_listed_with_no_reason()
    {
        var photo = await Stored();
        // How such a photo reads back from Mongo: hidden, with no reason fields (the in-memory store keeps null as given).
        await _factory.Photos.HideAsync(photo.Id, null!, Ct);

        var listed = (await _admin.GetFromJsonAsync<JsonElement>("/api/admin/hidden-photos", Ct))[0];

        Assert.Equal(photo.Id, listed.GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.Null, listed.GetProperty("hidden").ValueKind);
    }

    [Fact]
    public async Task Hiding_is_recorded_with_its_reason_and_note()
    {
        var photo = await Stored();

        await Hide(photo.Id, new { reason = "other", note = "a thumb over the lens" });

        var touched = (await LatestRecord()).Touched;
        Assert.Equal(HideReason.Other, touched.Reason);
        Assert.Equal("a thumb over the lens", touched.Note);
    }

    [Fact]
    public async Task Showing_a_photo_again_forgets_why_it_was_hidden()
    {
        var photo = await Stored();
        await Hide(photo.Id, new { reason = "rude", note = "rude words" });

        await Show(photo.Id);

        Assert.Null((await _factory.Photos.FindAsync(photo.Id, Ct))!.Hiding);
        Assert.Empty(await HiddenIds());
    }

    [Theory]
    [InlineData("POST", "/api/admin/photos/x/hide")]
    [InlineData("DELETE", "/api/admin/photos/x/hide")]
    [InlineData("GET", "/api/admin/hidden-photos")]
    public async Task Every_photo_admin_route_needs_the_key(string method, string path)
    {
        // As the page sends it: a hide carries its reason as JSON (a POST without a JSON body never reaches the endpoint).
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "POST") request.Content = JsonContent.Create(new { reason = "notKing" });
        var response = await _public.SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
