using Deque.AxeCore.Commons;
using Deque.AxeCore.Playwright;
using System.Text.Json;
using Microsoft.Playwright;

namespace KingOfWees.E2E;

// One class so these flows run one after another against the shared database.
public sealed class KingFlowTests(AppFixture app)
{
    private static readonly AxeRunOptions Wcag22AA = new()
    {
        RunOnly = RunOnlyOptions.Tags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]),
    };

    private static async Task AssertNoAxeViolations(IPage page)
    {
        // Scan the settled screen: mid-transition colors (e.g. a button fading to "pressed") fail contrast spuriously.
        await page.WaitForFunctionAsync("() => document.getAnimations().every(a => a.playState !== 'running')");
        var result = await page.RunAxe(Wcag22AA);
        var violations = result.Violations.Select(v =>
            $"{v.Id}: {v.Help} at {string.Join(", ", v.Nodes.Select(n => $"{n.Html} ({string.Join("; ", n.Any.Select(c => c.Message))})"))}");
        Assert.True(!violations.Any(), string.Join("\n", violations));
    }

    private static ILocator Button(IPage page, string name) =>
        page.GetByRole(AriaRole.Button, new() { Name = name, Exact = true });

    private static ILocator NameQuestion(IPage page) =>
        page.GetByRole(AriaRole.Heading, new() { Name = "What should neighbors call you?" });

    private static ILocator StatusChips(IPage page) =>
        page.GetByRole(AriaRole.List, new() { Name = "King’s status" }).GetByRole(AriaRole.Listitem);

    // Each test gets a fresh browser context, so its first log asks for a name.
    private static async Task SkipNameQuestion(IPage page)
    {
        await Assertions.Expect(NameQuestion(page)).ToBeFocusedAsync();
        await Button(page, "Skip").ClickAsync();
    }

    private static ILocator WhereQuestion(IPage page) => page.GetByRole(AriaRole.Heading, new() { Name = "Where is King?" });

    private static async Task SkipWhereQuestion(IPage page)
    {
        await Assertions.Expect(WhereQuestion(page)).ToBeFocusedAsync();
        await Button(page, "Skip").ClickAsync();
    }

    private static async Task<JsonElement> Status(IPage page)
    {
        var response = await page.APIRequest.GetAsync("/api/king/status");
        return JsonDocument.Parse(await response.TextAsync()).RootElement;
    }

    // Shared database: a unique name keeps one test's spot from matching another's.
    private static string UniqueSpotName(string prefix) => $"{prefix} {Guid.NewGuid().ToString()[..8]}";

    [Fact]
    public async Task A_child_logs_a_feeding_with_two_foods_and_the_home_screen_shows_it()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");

        await Button(page, "I fed King").ClickAsync();
        await page.GetByLabel("Your first name or nickname").FillAsync("Sunny");
        await Button(page, "Save").ClickAsync();
        await Button(page, "Dry food").ClickAsync();
        await Button(page, "Treats").ClickAsync();
        await Button(page, "Log feeding").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Feast logged!" })).ToBeVisibleAsync();
        await Assertions.Expect(page.GetByText("Logging as Sunny")).ToBeVisibleAsync();
        await Button(page, "Done").ClickAsync();

        await Assertions.Expect(StatusChips(page)).ToHaveTextAsync(["Fed & seen just now"]);
        await Assertions.Expect(page.GetByText("Fed by Sunny").First).ToBeVisibleAsync();
        await Assertions.Expect(page.GetByText("Dry food and Treats").First).ToBeVisibleAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Level = 1 })).ToHaveTextAsync("King is content");
    }

    [Fact]
    public async Task A_sighting_can_be_undone_right_away()
    {
        var page = await app.NewPageAsync();
        var sightingsBefore = await CountSightingsAfterFreshLoad(page);

        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await SkipWhereQuestion(page);
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Thanks for spotting King!" })).ToBeVisibleAsync();
        await Button(page, "Undo").ClickAsync();
        await Assertions.Expect(Button(page, "I saw King")).ToBeVisibleAsync();

        // A fresh load, so the count comes from the server rather than the status held before the sighting.
        Assert.Equal(sightingsBefore, await CountSightingsAfterFreshLoad(page));
    }

    [Fact]
    public async Task The_feeding_flow_works_with_only_a_keyboard()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Assertions.Expect(Button(page, "I fed King")).ToBeVisibleAsync();

        await TabUntilFocused(page, "I fed King");
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(NameQuestion(page)).ToBeFocusedAsync();
        await page.Keyboard.PressAsync("Tab");
        await page.Keyboard.TypeAsync("Kit");
        await page.Keyboard.PressAsync("Enter");
        await TabUntilFocused(page, "Treats");
        await page.Keyboard.PressAsync("Enter");
        await TabUntilFocused(page, "Log feeding");
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Feast logged!" })).ToBeFocusedAsync();
        await TabUntilFocused(page, "Done");
        await page.Keyboard.PressAsync("Enter");

        await Assertions.Expect(page.GetByText("Fed by Kit").First).ToBeVisibleAsync();
    }

    [Fact]
    public async Task Every_screen_meets_WCAG_2_2_AA()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Assertions.Expect(Button(page, "I fed King")).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        await Button(page, "I fed King").ClickAsync();
        await Assertions.Expect(NameQuestion(page)).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        await Button(page, "Skip").ClickAsync();
        await Assertions.Expect(Button(page, "Wet food")).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        await Button(page, "Wet food").ClickAsync();
        await AssertNoAxeViolations(page);
        await Button(page, "Log feeding").ClickAsync();
        await Assertions.Expect(Button(page, "Done")).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);
    }

    [Fact]
    public async Task A_skipped_name_can_be_added_later_with_change_and_is_then_remembered()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");

        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await SkipWhereQuestion(page);
        await Assertions.Expect(page.GetByText("Logging as a neighbor")).ToBeVisibleAsync();
        await Button(page, "change").ClickAsync();
        await page.GetByLabel("Your first name or nickname").FillAsync("Moonbeam");
        await Button(page, "Save").ClickAsync();
        await Assertions.Expect(page.GetByText("Logging as Moonbeam")).ToBeVisibleAsync();
        await Button(page, "Done").ClickAsync();

        // A reload proves the name lives in the browser, not just in the page.
        await page.ReloadAsync();
        await Button(page, "I saw King").ClickAsync();
        await SkipWhereQuestion(page);
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Thanks for spotting King!" })).ToBeVisibleAsync();
        await Button(page, "Done").ClickAsync();
        await Assertions.Expect(page.GetByText("Seen by Moonbeam").First).ToBeVisibleAsync();
    }

    [Fact]
    public async Task Food_left_out_does_not_count_as_seeing_him()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await SkipWhereQuestion(page);
        await Button(page, "Done").ClickAsync();

        await Button(page, "I fed King").ClickAsync();
        await page.GetByRole(AriaRole.Checkbox, new() { Name = "I left food out (didn’t see him)" }).CheckAsync();
        await Button(page, "Log feeding").ClickAsync();
        await Button(page, "Done").ClickAsync();

        await Assertions.Expect(StatusChips(page)).ToHaveTextAsync(["Fed just now", "Seen just now"]);
    }

    [Fact]
    public async Task I_m_near_him_now_sends_only_a_rounded_location_and_home_maps_it()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await Assertions.Expect(WhereQuestion(page)).ToBeFocusedAsync();

        var sent = await page.RunAndWaitForRequestAsync(
            () => Button(page, "I’m near him now").ClickAsync(), "**/api/king/sightings");

        // The browser itself rounds: the precise fix never leaves the device.
        var location = JsonDocument.Parse(sent.PostData!).RootElement.GetProperty("location");
        Assert.Equal(45.525, location.GetProperty("latitude").GetDouble());
        Assert.Equal(-122.679, location.GetProperty("longitude").GetDouble());
        await Button(page, "Done").ClickAsync();
        var map = page.GetByRole(AriaRole.Region, new() { Name = "Last fed & seen" });
        await Assertions.Expect(map.Locator(".map-marker").First).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);
    }

    [Fact]
    public async Task A_sighting_can_be_placed_by_tapping_the_map()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        var map = page.GetByRole(AriaRole.Region, new() { Name = "Map: tap where you saw King" });
        await Assertions.Expect(map).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);

        await map.ClickAsync();
        await Assertions.Expect(map.Locator(".map-marker-picked")).ToBeVisibleAsync();
        await Button(page, "Log sighting here").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Thanks for spotting King!" })).ToBeVisibleAsync();

        // The middle of the map is its center, give or take a block.
        var location = (await Status(page)).GetProperty("lastSeen").GetProperty("location");
        Assert.InRange(location.GetProperty("latitude").GetDouble(), AppFixture.MapLatitude - 0.002, AppFixture.MapLatitude + 0.002);
        Assert.InRange(location.GetProperty("longitude").GetDouble(), AppFixture.MapLongitude - 0.002, AppFixture.MapLongitude + 0.002);
    }

    [Fact]
    public async Task A_sighting_can_be_placed_on_the_map_with_only_a_keyboard()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Button(page, "I saw King").ClickAsync();
        await SkipNameQuestion(page);
        await Assertions.Expect(WhereQuestion(page)).ToBeFocusedAsync();

        await TabUntilFocused(page, "Use map center");
        await page.Keyboard.PressAsync("Enter");
        await TabUntilFocused(page, "Log sighting here");
        await page.Keyboard.PressAsync("Enter");
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Thanks for spotting King!" })).ToBeFocusedAsync();

        var location = (await Status(page)).GetProperty("lastSeen").GetProperty("location");
        Assert.Equal(AppFixture.MapLatitude, location.GetProperty("latitude").GetDouble());
        Assert.Equal(AppFixture.MapLongitude, location.GetProperty("longitude").GetDouble());
    }

    [Fact]
    public async Task A_new_feeding_spot_is_added_on_the_map_used_and_picked_again_next_time()
    {
        var page = await app.NewPageAsync();
        var name = UniqueSpotName("Gate");
        await page.GotoAsync("/");
        await Button(page, "I fed King").ClickAsync();
        await SkipNameQuestion(page);

        await Button(page, "Pick a spot").ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Where did you feed him?" })).ToBeFocusedAsync();
        await AssertNoAxeViolations(page);
        await Button(page, "Somewhere new").ClickAsync();
        await page.GetByLabel("Name this spot").FillAsync(name);
        await Button(page, "Use map center").ClickAsync();
        await Assertions.Expect(page.GetByText("Place picked.")).ToBeVisibleAsync();
        await AssertNoAxeViolations(page);
        await Button(page, "Save spot").ClickAsync();

        await Assertions.Expect(page.GetByText($"At {name}")).ToBeVisibleAsync();
        await Button(page, "Log feeding").ClickAsync();
        await Button(page, "Done").ClickAsync();
        await Assertions.Expect(page.GetByText($"at {name}").First).ToBeVisibleAsync();

        await Button(page, "I fed King").ClickAsync();
        await Assertions.Expect(page.GetByText($"At {name}")).ToBeVisibleAsync();
    }

    [Fact]
    public async Task The_home_map_shows_both_the_feeding_spot_and_a_sighting_placed_away_from_it()
    {
        var page = await app.NewPageAsync();
        await page.SetViewportSizeAsync(390, 844); // a phone: the home map is narrow
        await page.GotoAsync("/");
        await Button(page, "I fed King").ClickAsync();
        await SkipNameQuestion(page);
        await Button(page, "Pick a spot").ClickAsync();
        await Button(page, "Somewhere new").ClickAsync();
        await page.GetByLabel("Name this spot").FillAsync(UniqueSpotName("Steps"));
        await Button(page, "Use map center").ClickAsync();
        await Button(page, "Save spot").ClickAsync();
        await Button(page, "Log feeding").ClickAsync();
        await Button(page, "Done").ClickAsync();

        await Button(page, "I saw King").ClickAsync();
        // The test browser's GPS position is a couple of hundred meters from the map center.
        await Button(page, "I’m near him now").ClickAsync();
        await Button(page, "Done").ClickAsync();

        var homeMap = page.GetByRole(AriaRole.Region, new() { Name = "Last fed & seen" });
        await AssertInside(homeMap, homeMap.Locator(".map-marker-fed"));
        await AssertInside(homeMap, homeMap.Locator(".map-marker-seen"));
    }

    private static async Task AssertInside(ILocator frame, ILocator marker)
    {
        await Assertions.Expect(marker).ToHaveCountAsync(1);
        await Assertions.Expect(frame).ToBeVisibleAsync();
        // Let any pan or zoom animation finish before measuring.
        await frame.Page.WaitForFunctionAsync("() => document.getAnimations().every(a => a.playState !== 'running')");
        var f = (await frame.BoundingBoxAsync())!;
        var m = await marker.BoundingBoxAsync();
        Assert.NotNull(m);
        // The whole marker, at full size: Leaflet clips an off-screen marker to a sliver at the map's edge.
        Assert.True(
            m.Width >= 16 && m.X >= f.X && m.Y >= f.Y && m.X + m.Width <= f.X + f.Width && m.Y + m.Height <= f.Y + f.Height,
            $"Marker ({m.X:0}, {m.Y:0}, {m.Width:0}×{m.Height:0}) is not fully inside the map ({f.X:0}, {f.Y:0}, {f.Width:0}×{f.Height:0}).");
    }

    [Fact]
    public async Task Main_actions_are_big_enough_for_small_fingers_and_shaky_hands()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");

        foreach (var name in new[] { "I saw King", "I fed King" })
        {
            var box = await Button(page, name).BoundingBoxAsync();
            Assert.NotNull(box);
            Assert.True(box.Width >= 48 && box.Height >= 48, $"{name} is {box.Width}x{box.Height}px; minimum is 48x48.");
        }
    }

    [Fact]
    public async Task The_pseudo_locale_translates_the_page_and_sets_its_language()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/?locale=en-XA");
        var heading = page.GetByRole(AriaRole.Heading, new() { Level = 1 });
        await Assertions.Expect(heading).ToBeVisibleAsync();

        Assert.Equal("en-XA", await page.Locator("html").GetAttributeAsync("lang"));
        Assert.DoesNotContain("King is", await heading.TextContentAsync());
        Assert.DoesNotContain("I fed King", await page.Locator("body").InnerTextAsync());
    }

    [Fact]
    public async Task Footer_links_open_About_and_Privacy_in_place_and_both_meet_WCAG()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");
        await Assertions.Expect(Button(page, "I fed King")).ToBeVisibleAsync();
        // Survives in-app navigation, but not a full page load.
        await page.EvaluateAsync("() => { window.__stillSamePage = true; }");
        var footer = page.GetByRole(AriaRole.Contentinfo);

        await footer.GetByRole(AriaRole.Link, new() { Name = "About", Exact = true }).ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Level = 1, Name = "About King" })).ToBeFocusedAsync();
        await Assertions.Expect(page).ToHaveTitleAsync("About · King of Wees");
        await AssertNoAxeViolations(page);

        await footer.GetByRole(AriaRole.Link, new() { Name = "Privacy", Exact = true }).ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Level = 1, Name = "Privacy" })).ToBeFocusedAsync();
        await Assertions.Expect(page).ToHaveTitleAsync("Privacy · King of Wees");
        await AssertNoAxeViolations(page);

        Assert.True(await page.EvaluateAsync<bool>("() => window.__stillSamePage === true"), "A footer link reloaded the page.");
    }

    [Fact]
    public async Task A_shared_link_to_the_privacy_page_opens_it_directly()
    {
        var page = await app.NewPageAsync();

        await page.GotoAsync("/privacy");

        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Level = 1, Name = "Privacy" })).ToBeVisibleAsync();
    }

    private static async Task<int> CountSightingsAfterFreshLoad(IPage page)
    {
        await page.GotoAsync("/");
        await Assertions.Expect(Button(page, "I saw King")).ToBeVisibleAsync();
        return await page.GetByText("Seen by a neighbor").CountAsync();
    }

    private static async Task TabUntilFocused(IPage page, string buttonName)
    {
        for (var i = 0; i < 20; i++)
        {
            await page.Keyboard.PressAsync("Tab");
            var focused = await page.EvaluateAsync<string?>("() => document.activeElement?.textContent?.trim() ?? null");
            if (focused == buttonName) return;
        }
        Assert.Fail($"Could not reach \"{buttonName}\" by pressing Tab.");
    }
}
