using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Playwright;

namespace KingOfWees.E2E;

// Photo flows: the browser's own decode, canvas and JPEG encoder, which unit tests (jsdom) can't run.
public sealed partial class KingFlowTests
{
    // A phone-sized photo (4032×3024), drawn in the page: shapes rather than noise, so it compresses like a real one.
    private const string DrawPhonePhoto = """
        () => {
          const canvas = document.createElement('canvas');
          canvas.width = 4032;
          canvas.height = 3024;
          const context = canvas.getContext('2d');
          const gradient = context.createLinearGradient(0, 0, 4032, 3024);
          gradient.addColorStop(0, '#c96');
          gradient.addColorStop(1, '#336');
          context.fillStyle = gradient;
          context.fillRect(0, 0, 4032, 3024);
          for (let i = 0; i < 400; i++) {
            context.fillStyle = `hsl(${(i * 37) % 360} 60% 50%)`;
            context.beginPath();
            context.arc((i * 577) % 4032, (i * 331) % 3024, 40 + (i % 90), 0, 7);
            context.fill();
          }
          return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
        }
        """;

    private static async Task<FilePayload> PhonePhoto(IPage page) => new()
    {
        Name = "IMG_0001.jpg",
        MimeType = "image/jpeg",
        Buffer = Convert.FromBase64String(await page.EvaluateAsync<string>(DrawPhonePhoto)),
    };

    // A small photo for posting straight to the API (well under the limits, no resizing involved).
    private static async Task<byte[]> SmallPhoto(IPage page, int width, int height) =>
        Convert.FromBase64String(await page.EvaluateAsync<string>(
            "([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#8a6a12'; x.fillRect(0, 0, w, h); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }",
            new[] { width, height }));

    /// <summary>
    /// The JPEG with an EXIF block saying how to turn it, as a phone writes it: a portrait photo is usually stored
    /// landscape with orientation 6 ("turn 90° clockwise"). Inserted after the JFIF segment.
    /// </summary>
    private static byte[] WithOrientation(byte[] jpeg, byte orientation)
    {
        byte[] exif =
        [
            0xFF, 0xE1, 0x00, 0x22, // APP1, length 34
            (byte)'E', (byte)'x', (byte)'i', (byte)'f', 0, 0,
            (byte)'M', (byte)'M', 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, first IFD at 8
            0x00, 0x01, // one entry
            0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1
            0x00, 0x00, 0x00, 0x00, // no next IFD
        ];
        Assert.True(jpeg[2] == 0xFF && jpeg[3] == 0xE0, "expected a JFIF segment after SOI");
        var afterApp0 = 4 + ((jpeg[4] << 8) | jpeg[5]);
        return [.. jpeg[..afterApp0], .. exif, .. jpeg[afterApp0..]];
    }

    private static async Task<string> PostPhoto(IPage page, string eventId, string reporterKey)
    {
        var form = page.APIRequest.CreateFormData();
        form.Set("photo", new FilePayload { Name = "photo.jpg", MimeType = "image/jpeg", Buffer = await SmallPhoto(page, 800, 600) });
        form.Set("thumbnail", new FilePayload { Name = "thumbnail.jpg", MimeType = "image/jpeg", Buffer = await SmallPhoto(page, 200, 150) });
        var response = await page.APIRequest.PostAsync($"/api/king/events/{eventId}/photo",
            new() { Multipart = form, Headers = new Dictionary<string, string> { ["X-Reporter-Key"] = reporterKey } });
        Assert.Equal(201, response.Status);
        return JsonDocument.Parse(await response.TextAsync()).RootElement.GetProperty("id").GetString()!;
    }

    private static async Task<int> PhotoStatus(IPage page, string id) =>
        (await page.APIRequest.GetAsync($"/api/king/photos/{id}/full")).Status;

    private static Task<int[]> PixelSize(IPage page, string url) =>
        page.EvaluateAsync<int[]>(
            "async url => { const image = new Image(); image.src = url; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }",
            url);

    [Fact]
    public async Task A_photo_picked_with_the_keyboard_is_shrunk_in_the_browser_and_added_after_the_sighting()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        var photo = await PhonePhoto(page);

        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await Assertions.Expect(WhereQuestion(page)).ToBeFocusedAsync();
        await page.Keyboard.PressAsync("Tab");
        await Assertions.Expect(page.GetByLabel("Add a photo")).ToBeFocusedAsync();
        var chooser = await page.RunAndWaitForFileChooserAsync(() => page.Keyboard.PressAsync("Space"));
        await chooser.SetFilesAsync(photo);
        await Assertions.Expect(page.GetByRole(AriaRole.Img, new() { Name = "The photo you picked" })).ToBeVisibleAsync();
        await Assertions.Expect(Button(page, "Remove photo")).ToBeFocusedAsync();
        await AssertNoAxeViolations(page);

        await Button(page, "Log without a place").ClickAsync();
        await Assertions.Expect(page.GetByText("Photo added")).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        var photoId = (await Status(page)).GetProperty("lastSeen").GetProperty("photoId").GetString();
        int[] full = [1600, 1200], thumbnail = [400, 300];
        Assert.Equal(full, await PixelSize(page, $"/api/king/photos/{photoId}/full"));
        Assert.Equal(thumbnail, await PixelSize(page, $"/api/king/photos/{photoId}/thumb"));

        // Home: the sighting's line in Lately carries the photo, which opens the full size.
        await Button(page, "Done").ClickAsync();
        var lately = page.GetByRole(AriaRole.List, new() { Name = "Lately" });
        var latelyPhoto = lately.GetByRole(AriaRole.Link, new() { NameRegex = new("^Photo from a sighting by a neighbor") }).First;
        await Assertions.Expect(latelyPhoto).ToHaveAttributeAsync("href", $"/api/king/photos/{photoId}/full");
        await AssertNoAxeViolations(page);
    }

    [Fact]
    public async Task A_photo_shared_on_the_photos_page_comes_first_there_and_crowns_Home_and_the_page_meets_WCAG()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        var photo = await PhonePhoto(page);

        await page.GetByRole(AriaRole.Contentinfo).GetByRole(AriaRole.Link, new() { Name = "Photos" }).ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Photos of King", Level = 1 })).ToBeFocusedAsync();
        await page.GetByLabel("Share a photo").SetInputFilesAsync(photo);
        await Assertions.Expect(page.GetByText("Photo shared. Thank you!")).ToBeFocusedAsync();

        var grid = page.GetByRole(AriaRole.List, new() { Name = "Photos of King" });
        await Assertions.Expect(grid.GetByRole(AriaRole.Link).First).ToHaveAccessibleNameAsync(new Regex("^Photo shared by a neighbor on "));
        await AssertNoAxeViolations(page);

        // Only on this page: a shared photo is never a sighting, but it is the newest photo, so Home wears it.
        var sharedId = (await Status(page)).GetProperty("latestPhoto").GetProperty("id").GetString();
        await page.GetByRole(AriaRole.Link, new() { Name = "Back to King" }).ClickAsync();
        await Assertions.Expect(page.Locator(".king-avatar")).ToHaveAttributeAsync("src", $"/api/king/photos/{sharedId}/thumb");
        await Assertions.Expect(page.GetByRole(AriaRole.List, new() { Name = "Lately" }).GetByRole(AriaRole.Link, new() { NameRegex = new("^Photo shared") })).ToHaveCountAsync(0);
    }

    [Fact]
    public async Task A_portrait_photo_stored_sideways_by_a_phone_is_turned_upright_before_it_is_sent()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        var landscape = await PhonePhoto(page);
        var portrait = new FilePayload { Name = "IMG_0002.jpg", MimeType = "image/jpeg", Buffer = WithOrientation(landscape.Buffer, 6) };

        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await page.GetByLabel("Add a photo").SetInputFilesAsync(portrait);
        await Assertions.Expect(page.GetByRole(AriaRole.Img, new() { Name = "The photo you picked" })).ToBeVisibleAsync();
        await Button(page, "Log without a place").ClickAsync();
        await Assertions.Expect(page.GetByText("Photo added")).ToBeVisibleAsync();

        // The server strips EXIF, so the turn must already be in the pixels: 3024×4032 as seen, shrunk to 1200×1600.
        var photoId = (await Status(page)).GetProperty("lastSeen").GetProperty("photoId").GetString();
        int[] full = [1200, 1600], thumbnail = [300, 400];
        Assert.Equal(full, await PixelSize(page, $"/api/king/photos/{photoId}/full"));
        Assert.Equal(thumbnail, await PixelSize(page, $"/api/king/photos/{photoId}/thumb"));
    }

    [Fact]
    public async Task A_feeding_takes_a_photo_but_food_left_out_offers_none()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        var photo = await PhonePhoto(page);

        await Button(page, "I fed King").ClickAsync();
        await SkipNameQuestion(page);
        await page.GetByLabel("Add a photo").SetInputFilesAsync(photo);
        await Assertions.Expect(page.GetByRole(AriaRole.Img, new() { Name = "The photo you picked" })).ToBeVisibleAsync();
        await Button(page, "Log feeding").ClickAsync();
        await Assertions.Expect(page.GetByText("Photo added")).ToBeVisibleAsync();
        Assert.NotEqual(JsonValueKind.Null, (await Status(page)).GetProperty("lastFed").GetProperty("photoId").ValueKind);
        await Button(page, "Done").ClickAsync();

        await Button(page, "I fed King").ClickAsync();
        await page.GetByRole(AriaRole.Checkbox, new() { Name = "I left food out (didn’t see him)" }).CheckAsync();
        await Assertions.Expect(page.GetByLabel("Add a photo")).ToHaveCountAsync(0);
        await Button(page, "Log feeding").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Feast logged!" })).ToBeVisibleAsync();
        await Assertions.Expect(page.GetByLabel("Add a photo")).ToHaveCountAsync(0);
    }

    [Fact]
    public async Task A_photo_can_be_added_from_the_confirmation_and_meets_WCAG_in_the_pseudo_locale()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        var photo = await PhonePhoto(page);

        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await SkipWhereQuestion(page);
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Thanks for spotting King!" })).ToBeFocusedAsync();
        await page.GetByLabel("Add a photo").SetInputFilesAsync(photo);

        await Assertions.Expect(page.GetByText("Photo added")).ToBeFocusedAsync();
        await Assertions.Expect(page.GetByLabel("Add a photo")).ToHaveCountAsync(0);
        await AssertNoAxeViolations(page);

        // The photos page in the pseudo-locale: every word translated, still WCAG 2.2 AA.
        await page.GotoAsync("/photos?locale=en-XA");
        var heading = page.GetByRole(AriaRole.Heading, new() { Level = 1 });
        await Assertions.Expect(heading).ToBeVisibleAsync();
        Assert.DoesNotContain("Photos of King", await heading.TextContentAsync());
        var body = await page.Locator("body").InnerTextAsync();
        Assert.DoesNotContain("Share a photo", body);
        Assert.DoesNotContain("isn’t logged as a sighting", body);
        await AssertNoAxeViolations(page);
    }

    [Fact]
    public async Task An_admin_hides_a_photo_keeping_its_entry_and_shows_it_again()
    {
        var page = await app.NewPageAsync();
        var poster = UniqueName("Snapper");
        var key = Guid.NewGuid().ToString();
        var entryId = await PostSighting(page, key, poster);
        var photoId = await PostPhoto(page, entryId, key);
        await SignInAsAdmin(page);

        await page.GotoAsync("/history");
        var entry = Entries(page, $"Seen by {poster}");
        await Assertions.Expect(entry.GetByRole(AriaRole.Link, new() { NameRegex = new Regex("^Photo from a sighting") })).ToBeVisibleAsync();
        await entry.GetByRole(AriaRole.Button, new() { Name = "Hide this photo" }).ClickAsync();
        await Assertions.Expect(page.GetByText("Hide this photo from everyone? The entry stays.")).ToBeFocusedAsync();
        await Button(page, "Hide photo").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Status).Filter(new() { HasText = "Hidden." })).ToBeFocusedAsync();
        await Assertions.Expect(entry).ToHaveCountAsync(1);
        await Assertions.Expect(entry.GetByRole(AriaRole.Link, new() { NameRegex = new Regex("^Photo from") })).ToHaveCountAsync(0);
        Assert.Equal(404, await PhotoStatus(page, photoId));

        // /admin lists it in words only, never the picture; Show photo again brings it back.
        await page.GotoAsync("/admin");
        var hidden = page.GetByRole(AriaRole.List, new() { Name = "Hidden photos" }).GetByRole(AriaRole.Listitem)
            .Filter(new() { HasText = poster });
        await Assertions.Expect(hidden).ToContainTextAsync($"Photo on a sighting by {poster}");
        await Assertions.Expect(hidden.Locator("img")).ToHaveCountAsync(0);
        await AssertNoAxeViolations(page);
        await hidden.GetByRole(AriaRole.Button, new() { Name = "Show photo again" }).ClickAsync();
        await Assertions.Expect(hidden).ToHaveCountAsync(0);
        Assert.Equal(200, await PhotoStatus(page, photoId));

        // Hidden again from /photos, in admin mode.
        await page.GotoAsync("/photos");
        var tile = page.GetByRole(AriaRole.List, new() { Name = "Photos of King" }).GetByRole(AriaRole.Listitem)
            .Filter(new() { Has = page.Locator($"a[href='/api/king/photos/{photoId}/full']") });
        await tile.GetByRole(AriaRole.Button, new() { Name = "Hide this photo" }).ClickAsync();
        await tile.GetByRole(AriaRole.Button, new() { Name = "Hide photo" }).ClickAsync();
        await Assertions.Expect(tile).ToHaveCountAsync(0);
        Assert.Equal(404, await PhotoStatus(page, photoId));
    }
}
