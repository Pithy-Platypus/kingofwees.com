using Microsoft.Playwright;

namespace KingOfWees.E2E;

// Admin flows: same class as the others, so hiding never races another flow's reads of the shared database.
public sealed partial class KingFlowTests
{
    private static ILocator Entries(IPage page, string text) =>
        page.GetByRole(AriaRole.Listitem).Filter(new() { HasText = text });

    // A fresh device key per poster, so hiding it touches only this test's entries.
    private static async Task<string> PostSighting(IPage page, string reporterKey, string name) =>
        (await PostJson(page, "/api/king/sightings", new { reporterKey, reporterName = name })).GetProperty("id").GetString()!;

    private static string UniqueName(string prefix) => $"{prefix} {Guid.NewGuid().ToString()[..8]}";

    private static async Task SignInAsAdmin(IPage page)
    {
        await page.GotoAsync("/admin");
        await page.GetByLabel("Admin key").FillAsync(AppFixture.AdminKey);
        await Button(page, "Check key").ClickAsync();
        await Assertions.Expect(Button(page, "Sign out on this device")).ToBeVisibleAsync();
    }

    private static Task<IAPIResponse> AsAdmin(IPage page, string method, string url) =>
        page.APIRequest.FetchAsync(url, new() { Method = method, Headers = new Dictionary<string, string> { ["Authorization"] = $"Bearer {AppFixture.AdminKey}" } });

    [Fact]
    public async Task An_admin_hides_everything_from_a_poster_including_later_posts_and_restores_it()
    {
        var page = await app.NewPageAsync();
        var spammer = UniqueName("Spammy");
        var spamKey = Guid.NewGuid().ToString();
        await PostSighting(page, spamKey, spammer);
        await PostSighting(page, spamKey, spammer);

        await page.GotoAsync("/admin");
        await page.GetByLabel("Admin key").FillAsync("wrong-key");
        await Button(page, "Check key").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Alert)).ToHaveTextAsync("That key didn’t work.");
        await SignInAsAdmin(page);

        await page.GotoAsync("/history");
        await Entries(page, $"Seen by {spammer}").First.GetByRole(AriaRole.Button, new() { Name = "Hide everything from this poster" }).ClickAsync();
        await Assertions.Expect(page.GetByText($"Hide 2 entries and no spots from {spammer}, including anything they post later?"))
            .ToBeFocusedAsync();
        await Button(page, "Hide all").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Status).Filter(new() { HasText = "Hidden." })).ToBeFocusedAsync();
        await Assertions.Expect(Entries(page, $"Seen by {spammer}")).ToHaveCountAsync(0);

        // The spammer posts again: still nobody sees it.
        await PostSighting(page, spamKey, spammer);
        Assert.DoesNotContain(spammer, (await Status(page)).GetRawText());

        await page.GotoAsync("/admin");
        var poster = page.GetByRole(AriaRole.List, new() { Name = "Hidden posters" }).GetByRole(AriaRole.Listitem)
            .Filter(new() { HasText = spammer });
        await Assertions.Expect(poster).ToContainTextAsync("3 entries · 0 spots");
        await poster.GetByRole(AriaRole.Button, new() { Name = "Restore" }).ClickAsync();
        await Assertions.Expect(poster).ToHaveCountAsync(0);

        await page.GotoAsync("/history");
        await Assertions.Expect(Entries(page, $"Seen by {spammer}")).ToHaveCountAsync(3);
    }

    [Fact]
    public async Task An_admin_hides_one_entry_keeping_the_poster_s_others_and_shows_it_again()
    {
        var page = await app.NewPageAsync();
        var key = Guid.NewGuid().ToString();
        var oops = UniqueName("Oops");
        var fine = UniqueName("Fine");
        await PostSighting(page, key, fine);
        await PostSighting(page, key, oops);
        await SignInAsAdmin(page);

        await page.GotoAsync("/history");
        await Entries(page, $"Seen by {oops}").GetByRole(AriaRole.Button, new() { Name = "Hide this entry" }).ClickAsync();
        await Assertions.Expect(page.GetByText("Hide this entry from everyone?")).ToBeFocusedAsync();
        await Button(page, "Hide it").ClickAsync();
        await Assertions.Expect(Entries(page, $"Seen by {oops}")).ToHaveCountAsync(0);
        await Assertions.Expect(Entries(page, $"Seen by {fine}")).ToHaveCountAsync(1);

        await page.GotoAsync("/admin");
        var hidden = page.GetByRole(AriaRole.List, new() { Name = "Hidden entries" }).GetByRole(AriaRole.Listitem)
            .Filter(new() { HasText = $"Seen by {oops}" });
        await hidden.GetByRole(AriaRole.Button, new() { Name = "Show again" }).ClickAsync();
        await Assertions.Expect(hidden).ToHaveCountAsync(0);

        await page.GotoAsync("/history");
        await Assertions.Expect(Entries(page, $"Seen by {oops}")).ToHaveCountAsync(1);
    }

    [Fact]
    public async Task The_admin_pages_meet_WCAG_2_2_AA_and_signing_in_and_hiding_work_with_only_a_keyboard()
    {
        var page = await app.NewPageAsync();
        // Something in each hidden list, so the scans cover filled lists, not just empty states.
        var entryId = await PostSighting(page, Guid.NewGuid().ToString(), UniqueName("Scan entry"));
        var posterId = await PostSighting(page, Guid.NewGuid().ToString(), UniqueName("Scan poster"));
        Assert.True((await AsAdmin(page, "POST", $"/api/admin/events/{entryId}/hide")).Ok);
        Assert.True((await AsAdmin(page, "POST", $"/api/admin/events/{posterId}/hide-device")).Ok);

        await page.GotoAsync("/admin");
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Level = 1, Name = "Admin" })).ToBeFocusedAsync();
        await AssertNoAxeViolations(page);

        // Keyboard only: from the focused heading, Tab reaches the key field, and Enter checks it.
        await page.Keyboard.PressAsync("Tab");
        await page.Keyboard.TypeAsync("wrong-key");
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(page.GetByRole(AriaRole.Alert)).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);
        await page.GetByLabel("Admin key").FillAsync("");
        await page.GetByLabel("Admin key").FocusAsync();
        await page.Keyboard.TypeAsync(AppFixture.AdminKey);
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(page.GetByRole(AriaRole.List, new() { Name = "Hidden posters" })).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        await page.GotoAsync("/history");
        await Assertions.Expect(Button(page, "Hide this entry").First).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        await page.GetByRole(AriaRole.Heading, new() { Level = 1 }).FocusAsync();
        await TabUntilFocused(page, "Hide this entry", maxTabs: 60);
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(page.GetByText("Hide this entry from everyone?")).ToBeFocusedAsync();
        await AssertNoAxeViolations(page);
        await TabUntilFocused(page, "Cancel");
        await page.Keyboard.PressAsync("Enter");
        Assert.Equal("Hide this entry", await page.EvaluateAsync<string?>("() => document.activeElement?.textContent?.trim() ?? null"));
    }

    [Fact]
    public async Task The_admin_page_is_translated_in_the_pseudo_locale()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/admin?locale=en-XA");
        var heading = page.GetByRole(AriaRole.Heading, new() { Level = 1 });
        await Assertions.Expect(heading).ToBeVisibleAsync();

        Assert.NotEqual("Admin", await heading.TextContentAsync());
        Assert.DoesNotContain("Check key", await page.Locator("body").InnerTextAsync());
    }
}
