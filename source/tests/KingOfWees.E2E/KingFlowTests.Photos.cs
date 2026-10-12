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
}
