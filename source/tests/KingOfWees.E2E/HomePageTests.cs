using Deque.AxeCore.Commons;
using Deque.AxeCore.Playwright;

namespace KingOfWees.E2E;

public sealed class HomePageTests(AppFixture app)
{
    [Fact]
    public async Task Home_page_is_titled_King_of_Wees()
    {
        var page = await app.NewPageAsync();

        await page.GotoAsync("/");

        Assert.Equal("King of Wees", await page.TitleAsync());
    }

    [Fact]
    public async Task Home_page_has_no_WCAG_2_2_AA_violations()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");

        var result = await page.RunAxe(Wcag22AA);

        Assert.Empty(result.Violations.Select(v => $"{v.Id}: {v.Help} ({v.Nodes.Length} nodes)"));
    }

    private static readonly AxeRunOptions Wcag22AA = new()
    {
        RunOnly = RunOnlyOptions.Tags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]),
    };
}
