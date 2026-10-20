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

    [Fact]
    public async Task The_page_names_the_crown_icons_and_each_one_loads()
    {
        var page = await app.NewPageAsync();
        await page.GotoAsync("/");

        var icons = new Dictionary<string, string>();
        foreach (var link in await page.Locator("head link[rel=icon], head link[rel=apple-touch-icon]").AllAsync())
        {
            icons[(await link.GetAttributeAsync("rel"))! + " " + (await link.GetAttributeAsync("href"))!] =
                (await link.GetAttributeAsync("type")) ?? "";
        }

        // A PNG for Safari: its tab showed a letter with only our .ico and SVG, as it did for a site offering only
        // a .ico, while a site offering PNGs got its icon (2026-10-20).
        Assert.Equal(["apple-touch-icon /apple-touch-icon.png", "icon /favicon-32.png", "icon /favicon.ico", "icon /favicon.svg"], icons.Keys.Order());
        foreach (var (path, type) in new[]
        {
            ("/favicon.ico", "image/x-icon"), ("/favicon.svg", "image/svg+xml"), ("/favicon-32.png", "image/png"),
            ("/apple-touch-icon.png", "image/png"),
        })
        {
            var response = await page.APIRequest.GetAsync(path);
            Assert.Equal(200, response.Status);
            Assert.StartsWith(type, response.Headers["content-type"]);
        }
    }

    [Fact]
    public async Task Robots_txt_lets_crawlers_read_the_pages_but_not_the_api()
    {
        // The pages carry X-Robots-Tag: noindex (SecurityHeadersTests); a crawler kept out would never see it.
        var page = await app.NewPageAsync();

        var response = await page.APIRequest.GetAsync("/robots.txt");
        var rules = (await response.TextAsync()).Split('\n').Where(l => l.Length > 0 && !l.StartsWith('#')).ToArray();

        Assert.Equal(200, response.Status);
        Assert.Equal(["User-agent: *", "Disallow: /api/"], rules);
    }

    private static readonly AxeRunOptions Wcag22AA = new()
    {
        RunOnly = RunOnlyOptions.Tags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]),
    };
}
