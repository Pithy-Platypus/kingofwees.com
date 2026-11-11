using System.Net;
using System.Net.Http.Headers;
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

    private Task<string> LoggedSighting(string device = DeviceKey) => _client.SeeAsync(device, "Sarah", Ct);

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
        Assert.Equal("same-origin", response.Headers.GetValues("Cross-Origin-Resource-Policy").Single());
        Assert.True(response.Headers.CacheControl?.Private);
        Assert.Equal(TimeSpan.FromHours(1), response.Headers.CacheControl?.MaxAge);
        Assert.False(response.Headers.ETag?.IsWeak ?? true); // the file's own tag, for the browser's next ask
        Assert.NotNull(response.Content.Headers.LastModified);
    }

    [Fact]
    public async Task A_file_the_browser_already_has_is_a_304_without_the_bytes()
    {
        // After the hour's max-age the browser asks again with If-None-Match; the files never change, so the answer
        // is a 304 with the same headers — and nothing to download.
        var photo = await Stored();
        var first = await _client.GetAsync($"/api/king/photos/{photo.Id}/thumb", Ct);

        var again = await _client.SendAsync(Revalidation(photo.Id, first.Headers.ETag!), Ct);

        Assert.Equal(HttpStatusCode.NotModified, again.StatusCode);
        Assert.Empty(await again.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal(first.Headers.ETag, again.Headers.ETag);
        Assert.Equal(first.Headers.CacheControl, again.Headers.CacheControl);
    }

    [Fact]
    public async Task A_tag_the_file_doesn_t_have_gets_the_bytes()
    {
        var photo = await Stored();

        var response = await _client.SendAsync(Revalidation(photo.Id, new EntityTagHeaderValue("\"someone-else-s\"")), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TestJpeg.Make(50), await response.Content.ReadAsByteArrayAsync(Ct));
    }

    [Fact]
    public async Task A_photo_hidden_since_the_browser_saw_it_is_404_not_304()
    {
        // The visibility check comes before the file: a browser revalidating a hidden photo must not be told to keep it.
        // It asks again after its hour, long past the minute the files remember a photo visible (PhotoVisibility).
        var photo = await Stored();
        var first = await _client.GetAsync($"/api/king/photos/{photo.Id}/thumb", Ct);
        await _factory.Photos.HideAsync(photo.Id, Hiding, Ct);
        _factory.Clock.Advance(TimeSpan.FromHours(1));

        var again = await _client.SendAsync(Revalidation(photo.Id, first.Headers.ETag!), Ct);

        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    [Fact]
    public async Task A_served_photo_s_files_come_without_the_store_for_a_minute_and_not_after()
    {
        // Fifty thumbnails a page were three Mongo reads each. Once served, a photo is remembered visible for a minute
        // (PhotoVisibility): hidden straight in the store here — what a hide this replica never heard of would look
        // like — its files still come for that minute, and not after. An admin's own hide forgets at once
        // (AdminPhotoApiTests, AdminHidingApiTests).
        var photo = await Stored();
        Assert.Equal(HttpStatusCode.OK, await Status(photo.Id, "thumb"));
        await _factory.Photos.HideAsync(photo.Id, Hiding, Ct);

        _factory.Clock.Advance(TimeSpan.FromSeconds(59));
        Assert.Equal(HttpStatusCode.OK, await Status(photo.Id, "thumb"));
        Assert.Equal(HttpStatusCode.OK, await Status(photo.Id, "full")); // one memory per photo, both sizes
        _factory.Clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(HttpStatusCode.NotFound, await Status(photo.Id, "thumb"));
        Assert.Equal(HttpStatusCode.NotFound, await Status(photo.Id, "full"));
    }

    [Theory]
    [InlineData("the photos page")]
    [InlineData("one photo")]
    [InlineData("status, the newest photo")]
    [InlineData("history, an entry's photo")]
    public async Task A_read_that_showed_a_photo_visible_lets_its_files_come_without_the_store(string read)
    {
        // Fifty thumbnails follow the list that just proved them visible, Home's avatar its status read: those reads
        // remember what they showed, so a cold page costs the list's reads and nothing per thumbnail.
        var onEntry = await Stored(eventId: await LoggedSighting());
        var shared = await Stored();
        var photo = read.StartsWith("history") ? onEntry : shared;
        await _client.GetAsync(read switch
        {
            "the photos page" => "/api/king/photos",
            "one photo" => $"/api/king/photos/{photo.Id}",
            "status, the newest photo" => "/api/king/status",
            _ => "/api/king/history",
        }, Ct);
        await _factory.Photos.HideAsync(photo.Id, Hiding, Ct); // straight in the store: the files didn't hear

        Assert.Equal(HttpStatusCode.OK, await Status(photo.Id, "thumb"));
    }

    [Fact]
    public async Task Only_visibility_is_remembered_so_a_photo_shown_again_comes_back_at_once()
    {
        var photo = await Stored();
        await _factory.Photos.HideAsync(photo.Id, Hiding, Ct);
        Assert.Equal(HttpStatusCode.NotFound, await Status(photo.Id, "thumb"));

        await _factory.Photos.ShowAsync(photo.Id, Ct);

        Assert.Equal(HttpStatusCode.OK, await Status(photo.Id, "thumb"));
    }

    private async Task<HttpStatusCode> Status(string id, string size) =>
        (await _client.GetAsync($"/api/king/photos/{id}/{size}", Ct)).StatusCode;

    private static HttpRequestMessage Revalidation(string id, EntityTagHeaderValue etag)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/king/photos/{id}/thumb");
        request.Headers.IfNoneMatch.Add(etag);
        return request;
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
    public async Task One_photo_by_id_is_shaped_as_the_list_shows_it_with_its_entry()
    {
        // A link to one photo (/photos/{id}) may name one older than the page's first 50: the viewer asks for it alone.
        var entry = await LoggedSighting();
        var onEntry = await Stored(eventId: entry);
        var shared = await Stored();

        var one = await _client.GetFromJsonAsync<JsonElement>($"/api/king/photos/{onEntry.Id}", Ct);
        var other = await _client.GetFromJsonAsync<JsonElement>($"/api/king/photos/{shared.Id}", Ct);

        Assert.Equal(onEntry.Id, one.GetProperty("id").GetString());
        Assert.Equal("Sarah", one.GetProperty("reporterName").GetString());
        Assert.Equal(entry, one.GetProperty("event").GetProperty("id").GetString());
        Assert.Equal(onEntry.Id, one.GetProperty("event").GetProperty("photoId").GetString());
        Assert.Equal(JsonValueKind.Null, other.GetProperty("event").ValueKind);
    }

    [Theory]
    [InlineData("hidden itself")]
    [InlineData("on a hidden entry")]
    [InlineData("from a hidden device")]
    [InlineData("unknown")]
    public async Task A_photo_that_isn_t_visible_is_404_by_id(string shape)
    {
        var entry = await LoggedSighting();
        var id = (await Stored(eventId: entry)).Id;
        switch (shape)
        {
            case "hidden itself": await _factory.Photos.HideAsync(id, Hiding, Ct); break;
            case "on a hidden entry": await _factory.Store.SetHiddenAsync(entry, true, Ct); break;
            case "from a hidden device": await _factory.Hidden.HideAsync(DeviceKey, _factory.Clock.GetUtcNow(), Ct); break;
            case "unknown": id = Guid.CreateVersion7().ToString(); break;
        }

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/king/photos/{id}", Ct)).StatusCode);
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
        Assert.Equal([code], (await response.JsonAsync(Ct)).ErrorCodes());
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
