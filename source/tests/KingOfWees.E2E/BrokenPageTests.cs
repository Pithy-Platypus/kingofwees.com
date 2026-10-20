using System.Text.Json;
using Deque.AxeCore.Commons;
using Deque.AxeCore.Playwright;
using Microsoft.Playwright;

namespace KingOfWees.E2E;

// A page that fails to draw says so instead of going blank, and tells the server what broke (docs/patterns/telemetry.md).
public sealed class BrokenPageTests(AppFixture app)
{
    [Fact]
    public async Task A_page_that_fails_to_draw_says_so_and_reports_it()
    {
        var page = await app.NewPageAsync();
        // A reply Home can't draw (as from a server and page out of step): no list of recent entries.
        await page.RouteAsync("**/api/king/status", route => route.FulfillAsync(new()
        {
            Status = 200,
            ContentType = "application/json",
            Body = """{"lastFed":null,"lastSeen":null,"recent":null,"latestPhoto":null}""",
        }));
        var reported = page.WaitForResponseAsync(r => r.Url.EndsWith("/api/client-diagnostics") && r.Request.Method == "POST");

        await page.GotoAsync("/?locale=en-XA");

        var heading = page.GetByRole(AriaRole.Heading, new() { Level = 1 });
        await Assertions.Expect(heading).ToBeFocusedAsync();
        Assert.DoesNotContain("Something went wrong", await heading.TextContentAsync());
        await Assertions.Expect(page.GetByRole(AriaRole.Button)).ToHaveCountAsync(1);

        var response = await reported;
        Assert.Equal(204, response.Status);
        var report = JsonDocument.Parse(response.Request.PostData!).RootElement;
        Assert.Equal("render", report.GetProperty("kind").GetString());
        Assert.Equal("/", report.GetProperty("path").GetString());
        Assert.False(string.IsNullOrEmpty(report.GetProperty("message").GetString()));

        var result = await page.RunAxe(new AxeRunOptions
        {
            RunOnly = RunOnlyOptions.Tags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]),
        });
        Assert.Empty(result.Violations.Select(v => $"{v.Id}: {v.Help} ({v.Nodes.Length} nodes)"));
    }
}
