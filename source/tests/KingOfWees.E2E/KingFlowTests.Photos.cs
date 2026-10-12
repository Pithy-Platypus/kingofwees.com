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
    }
}
