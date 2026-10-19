using Microsoft.Playwright;

namespace KingOfWees.E2E;

// Undo from Lately, the history page and Photos: the browser remembers its own posts for the server's 10 minutes.
public sealed partial class KingFlowTests
{
    private static ILocator Lately(IPage page) => page.GetByRole(AriaRole.List, new() { Name = "Lately" });

    private static async Task<string> LogSightingThenDone(IPage page)
    {
        await page.GotoAsync("/");
        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await SkipWhereQuestion(page);
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Thanks for spotting King!" })).ToBeVisibleAsync();
        var id = (await Status(page)).GetProperty("recent")[0].GetProperty("id").GetString()!;
        await Button(page, "Done").ClickAsync();
        return id;
    }

    [Fact]
    public async Task An_entry_is_undone_from_Lately_with_only_a_keyboard_after_leaving_the_confirmation()
    {
        var page = await app.NewPageAsync();
        var id = await LogSightingThenDone(page);

        // Another browser is another device: it has nothing to undo.
        var neighbor = await app.NewPageAsync();
        await neighbor.GotoAsync("/");
        await Assertions.Expect(Lately(neighbor).GetByText("Seen by a neighbor").First).ToBeVisibleAsync();
        await Assertions.Expect(Button(neighbor, "Undo")).ToHaveCountAsync(0);

        await Assertions.Expect(Lately(page).GetByRole(AriaRole.Button, new() { Name = "Undo", Exact = true })).ToHaveCountAsync(1);
        await Lately(page).GetByRole(AriaRole.Button, new() { Name = "Undo", Exact = true }).FocusAsync();
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(page.GetByText("Undo this sighting?")).ToBeFocusedAsync();
        await AssertNoAxeViolations(page);
        await page.Keyboard.PressAsync("Tab");
        await Assertions.Expect(Button(page, "Undo it")).ToBeFocusedAsync();
        await page.Keyboard.PressAsync("Enter");

        await Assertions.Expect(page.GetByText("Your entry was undone.")).ToBeFocusedAsync();
        await Assertions.Expect(Button(page, "Undo")).ToHaveCountAsync(0);
        var recent = (await Status(page)).GetProperty("recent").EnumerateArray().Select(e => e.GetProperty("id").GetString());
        Assert.DoesNotContain(id, recent);
    }

    [Fact]
    public async Task An_entry_is_undone_from_the_history_page_which_meets_WCAG_in_the_pseudo_locale()
    {
        var page = await app.NewPageAsync();
        var id = await LogSightingThenDone(page);

        await page.GotoAsync("/history?locale=en-XA");
        var undo = page.Locator(".own-button");
        await Assertions.Expect(undo).ToHaveCountAsync(1);
        Assert.DoesNotContain("Undo", await undo.TextContentAsync());
        await undo.ClickAsync();
        Assert.DoesNotContain("Undo this sighting?", await page.Locator("body").InnerTextAsync());
        await AssertNoAxeViolations(page);
        await page.Locator(".own-confirm-button").ClickAsync();

        await Assertions.Expect(page.Locator(".own-button")).ToHaveCountAsync(0);
        var history = await page.APIRequest.GetAsync("/api/king/history");
        Assert.DoesNotContain(id, await history.TextAsync());
    }

    [Fact]
    public async Task A_just_shared_photo_is_removed_from_the_photos_page()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/photos");
        await page.GetByLabel("Share a photo").SetInputFilesAsync(await PhonePhoto(page));
        await Assertions.Expect(page.GetByText("Photo shared. Thank you!")).ToBeFocusedAsync();
        var id = (await Status(page)).GetProperty("latestPhoto").GetProperty("id").GetString()!;

        var grid = page.GetByRole(AriaRole.List, new() { Name = "Photos of King" });
        await Assertions.Expect(grid.GetByRole(AriaRole.Button, new() { Name = "Remove", Exact = true })).ToHaveCountAsync(1);
        await grid.GetByRole(AriaRole.Button, new() { Name = "Remove", Exact = true }).ClickAsync();
        await Assertions.Expect(page.GetByText("Remove this photo?")).ToBeFocusedAsync();
        await AssertNoAxeViolations(page);
        await Button(page, "Remove it").ClickAsync();

        await Assertions.Expect(page.GetByText("Your photo was removed.")).ToBeFocusedAsync();
        await Assertions.Expect(page.Locator($"img[src='/api/king/photos/{id}/thumb']")).ToHaveCountAsync(0);
        Assert.Equal(404, (await page.APIRequest.GetAsync($"/api/king/photos/{id}/full")).Status);
    }
}
