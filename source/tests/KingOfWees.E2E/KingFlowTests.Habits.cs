using Microsoft.Playwright;

namespace KingOfWees.E2E;

// King's habits: the three charts on /history (KingFlowTests.cs has the heat map and the log).
public sealed partial class KingFlowTests
{
    [Fact]
    public async Task History_shows_King_s_habits_with_today_crowned_and_meets_WCAG_2_2_AA()
    {
        var page = await app.NewPageAsync();
        await PostJson(page, "/api/king/feedings", new { reporterKey = "e2e-habits", reporterName = "Habit tester", foods = new[] { "wet", "treats" } });
        await PostJson(page, "/api/king/sightings", new { reporterKey = "e2e-habits" });

        await page.GotoAsync("/history");
        var habits = page.GetByRole(AriaRole.Region, new() { Name = "King’s habits" });
        await Assertions.Expect(habits.GetByRole(AriaRole.Figure)).ToHaveCountAsync(5);
        await Assertions.Expect(habits.GetByText("His Majesty was content")).ToBeVisibleAsync();

        await Assertions.Expect(habits.GetByRole(AriaRole.Img, new() { Name = "Feedings and times seen, by hour of the day" })).ToBeVisibleAsync();
        var hours = habits.GetByRole(AriaRole.List, new() { Name = "Hours with something logged" }).GetByRole(AriaRole.Listitem);
        await Assertions.Expect(hours.Filter(new() { HasText = "feeding" }).First).ToBeVisibleAsync();

        var days = habits.GetByRole(AriaRole.List, new() { Name = "The last 35 days" }).GetByRole(AriaRole.Listitem);
        await Assertions.Expect(days).ToHaveCountAsync(35);
        await Assertions.Expect(days.Last).ToHaveClassAsync(new System.Text.RegularExpressions.Regex("habits-day-fed"));
        await Assertions.Expect(days.Last).ToHaveClassAsync(new System.Text.RegularExpressions.Regex("habits-day-today"));
        await Assertions.Expect(days.Last).ToContainTextAsync(": fed");

        var menu = habits.GetByRole(AriaRole.List, new() { Name = "How often each food came with a feeding" }).GetByRole(AriaRole.Listitem);
        await Assertions.Expect(menu).ToHaveCountAsync(3);
        await Assertions.Expect(menu.First).ToContainTextAsync("Wet food");

        var court = habits.GetByRole(AriaRole.List, new() { Name = "Neighbors with most feedings" }).GetByRole(AriaRole.Listitem);
        await Assertions.Expect(court.Filter(new() { HasText = "Habit tester" })).ToHaveCountAsync(1);

        // One range switch for the page: "7 days" narrows the heat map and the charts together, and the calendar keeps its 35 days.
        await Button(page, "7 days").ClickAsync();
        await Assertions.Expect(Button(page, "7 days")).ToHaveAttributeAsync("aria-pressed", "true");
        await Assertions.Expect(page.GetByRole(AriaRole.Group, new() { Name = "Time range" })).ToHaveCountAsync(1);
        await Assertions.Expect(days).ToHaveCountAsync(35);
        await Assertions.Expect(court.Filter(new() { HasText = "Habit tester" })).ToHaveCountAsync(1);

        // The 24 bars and the 5 × 7 grid fit a phone without a sideways scroll.
        await page.SetViewportSizeAsync(360, 740);
        Assert.False(await page.EvaluateAsync<bool>("() => document.documentElement.scrollWidth > document.documentElement.clientWidth"), "History scrolls sideways at 360 px.");

        await AssertNoAxeViolations(page);
    }
}
