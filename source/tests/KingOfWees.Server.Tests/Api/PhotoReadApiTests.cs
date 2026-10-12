using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.Photos;

namespace KingOfWees.Server.Tests.Api;

// Reading photos: files served only while visible, entries carry their photo, the photos page, Home's newest photo.
public sealed class PhotoReadApiTests : IAsyncLifetime
{
    private const string DeviceKey = "device-key-1";

    private readonly KingApiFactory _factory = new();
    private HttpClient _client = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly PhotoHiding Hiding = new(HideReason.NotKing, null, DateTimeOffset.UnixEpoch, "Wallie");

    public ValueTask InitializeAsync()
    {
        _client = _factory.CreateClient();
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private static IEnumerable<string?> ErrorCodes(JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());

    private async Task<string> LoggedSighting(string device = DeviceKey) =>
        (await (await _client.PostAsJsonAsync("/api/king/sightings", new { reporterKey = device, reporterName = "Sarah" }, Ct))
            .Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString()!;

    // Straight into the stores, a minute apart, so the order is the clock's.
    private async Task<Photo> Stored(string? eventId = null, string device = DeviceKey)
    {
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        var photo = new Photo(Guid.CreateVersion7().ToString(), eventId, _factory.Clock.GetUtcNow(), device, "Sarah");
        await _factory.PhotoFiles.PutAsync(PhotoFiles.Full(photo.Id), new MemoryStream(TestJpeg.Make(200)), Ct);
        await _factory.PhotoFiles.PutAsync(PhotoFiles.Thumbnail(photo.Id), new MemoryStream(TestJpeg.Make(50)), Ct);
        await _factory.Photos.AddAsync(photo, Ct);
        return photo;
    }

    private async Task<JsonElement> Status() => await _client.GetFromJsonAsync<JsonElement>("/api/king/status", Ct);

    private async Task<JsonElement> PhotosPage(string query = "") =>
        await _client.GetFromJsonAsync<JsonElement>($"/api/king/photos{query}", Ct);

    private static string?[] Ids(JsonElement page) =>
        [.. page.GetProperty("photos").EnumerateArray().Select(p => p.GetProperty("id").GetString())];

    [Theory]
    [InlineData("full", 200)]
    [InlineData("thumb", 50)]
    public async Task A_visible_photo_s_files_are_served_as_private_jpegs(string size, int bytes)
    {
        var photo = await Stored();

        var response = await _client.GetAsync($"/api/king/photos/{photo.Id}/{size}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TestJpeg.Make(bytes), await response.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal("image/jpeg", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.True(response.Headers.CacheControl?.Private);
        Assert.Equal(TimeSpan.FromHours(1), response.Headers.CacheControl?.MaxAge);
    }

    [Theory]
    [InlineData("hidden itself")]
    [InlineData("on a hidden entry")]
    [InlineData("from a hidden device")]
    [InlineData("unknown")]
    [InlineData("files missing")]
    public async Task A_photo_that_isn_t_visible_is_404_for_both_sizes(string shape)
    {
        var entry = await LoggedSighting();
        var photo = await Stored(eventId: entry);
        var id = photo.Id;
        switch (shape)
        {
            case "hidden itself": await _factory.Photos.HideAsync(id, Hiding, Ct); break;
            case "on a hidden entry": await _factory.Store.SetHiddenAsync(entry, true, Ct); break;
            case "from a hidden device": await _factory.Hidden.HideAsync(DeviceKey, _factory.Clock.GetUtcNow(), Ct); break;
            case "unknown": id = Guid.CreateVersion7().ToString(); break;
            case "files missing":
                await _factory.PhotoFiles.DeleteAsync(PhotoFiles.Full(id), Ct);
                await _factory.PhotoFiles.DeleteAsync(PhotoFiles.Thumbnail(id), Ct);
                break;
        }

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/king/photos/{id}/full", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/king/photos/{id}/thumb", Ct)).StatusCode);
    }

    [Fact]
    public async Task Entries_in_status_and_history_carry_their_visible_photo()
    {
        var withPhoto = await LoggedSighting();
        var photo = await Stored(eventId: withPhoto);
        var hiddenPhotoEntry = await LoggedSighting();
        var hidden = await Stored(eventId: hiddenPhotoEntry);
        await _factory.Photos.HideAsync(hidden.Id, Hiding, Ct);
        var without = await LoggedSighting();

        var recent = (await Status()).GetProperty("recent").EnumerateArray()
            .ToDictionary(e => e.GetProperty("id").GetString()!, e => e.GetProperty("photoId").GetString());
        var history = (await _client.GetFromJsonAsync<JsonElement>("/api/king/history", Ct)).GetProperty("events").EnumerateArray()
            .ToDictionary(e => e.GetProperty("id").GetString()!, e => e.GetProperty("photoId").GetString());

        foreach (var photoIds in new[] { recent, history })
        {
            Assert.Equal(photo.Id, photoIds[withPhoto]);
            Assert.Null(photoIds[hiddenPhotoEntry]); // the entry stays, its photo doesn't
            Assert.Null(photoIds[without]);
        }
    }

    [Fact]
    public async Task Last_seen_carries_its_photo()
    {
        var entry = await LoggedSighting();
        var photo = await Stored(eventId: entry);

        Assert.Equal(photo.Id, (await Status()).GetProperty("lastSeen").GetProperty("photoId").GetString());
    }

    [Fact]
    public async Task The_photos_page_lists_every_visible_photo_newest_first_with_its_entry()
    {
        var entry = await LoggedSighting();
        var onEntry = await Stored(eventId: entry);
        var shared = await Stored();
        var hidden = await Stored();
        await _factory.Photos.HideAsync(hidden.Id, Hiding, Ct);
        await Stored(device: "spammer");
        await _factory.Hidden.HideAsync("spammer", _factory.Clock.GetUtcNow(), Ct);

        var page = await PhotosPage();

        Assert.Equal([shared.Id, onEntry.Id], Ids(page));
        var photos = page.GetProperty("photos").EnumerateArray().ToList();
        Assert.Equal(JsonValueKind.Null, photos[0].GetProperty("event").ValueKind);
        Assert.Equal("Sarah", photos[0].GetProperty("reporterName").GetString());
        Assert.Equal(shared.PostedAt, photos[0].GetProperty("postedAt").GetDateTimeOffset());
        Assert.Equal(entry, photos[1].GetProperty("event").GetProperty("id").GetString());
        Assert.Equal("seen", photos[1].GetProperty("event").GetProperty("kind").GetString());
        Assert.Equal(onEntry.Id, photos[1].GetProperty("event").GetProperty("photoId").GetString());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("next").ValueKind);
        Assert.DoesNotContain("reporterKey", page.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(DeviceKey, page.GetRawText());
    }

    [Fact]
    public async Task The_photos_page_pages_with_next_and_before()
    {
        var photos = new List<Photo>();
        for (var i = 0; i < 5; i++) photos.Add(await Stored());

        var first = await PhotosPage("?limit=2");
        var second = await PhotosPage($"?limit=2&before={first.GetProperty("next").GetString()}");
        var third = await PhotosPage($"?limit=2&before={second.GetProperty("next").GetString()}");

        string?[] newestFirst = [.. photos.AsEnumerable().Reverse().Select(p => p.Id)];
        string?[] paged = [.. Ids(first), .. Ids(second), .. Ids(third)];
        Assert.Equal(newestFirst, paged);
        Assert.Equal(JsonValueKind.Null, third.GetProperty("next").ValueKind);
    }

    [Theory]
    [InlineData("?limit=0", "limit.outOfRange")]
    [InlineData("?limit=101", "limit.outOfRange")]
    [InlineData("?before=nope", "before.unknown")]
    public async Task The_photos_page_query_is_validated(string query, string code)
    {
        var response = await _client.GetAsync($"/api/king/photos{query}", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([code], ErrorCodes(await response.Content.ReadFromJsonAsync<JsonElement>(Ct)));
    }

    [Fact]
    public async Task Status_carries_the_newest_visible_photo_of_any_kind_for_Home()
    {
        Assert.Equal(JsonValueKind.Null, (await Status()).GetProperty("latestPhoto").ValueKind);

        var onEntry = await Stored(eventId: await LoggedSighting());
        Assert.Equal(onEntry.Id, (await Status()).GetProperty("latestPhoto").GetProperty("id").GetString());

        var shared = await Stored();
        var latest = (await Status()).GetProperty("latestPhoto");
        Assert.Equal(shared.Id, latest.GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.Null, latest.GetProperty("event").ValueKind);

        await _factory.Photos.HideAsync(shared.Id, Hiding, Ct);
        Assert.Equal(onEntry.Id, (await Status()).GetProperty("latestPhoto").GetProperty("id").GetString());
    }
}
