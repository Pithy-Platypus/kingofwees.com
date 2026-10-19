using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry;
using OpenTelemetry.Trace;

namespace KingOfWees.Server.Tests.Api;

// One version for the server and the frontend it serves, as source/version.sh prints it, so a tester can quote
// exactly which build they saw.
public sealed partial class VersionApiTests : IDisposable
{
    private readonly string _webRoot = Directory.CreateTempSubdirectory("kingofwees-webroot-").FullName;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose() => Directory.Delete(_webRoot, recursive: true);

    // year.month.day without leading zeros + the 12-character commit, ".dirty" for a build with uncommitted changes.
    [System.Text.RegularExpressions.GeneratedRegex(@"^\d{4}\.[1-9]\d?\.[1-9]\d?\+[0-9a-f]{12}(\.dirty)?$")]
    private static partial System.Text.RegularExpressions.Regex VersionFormat();

    private async Task<JsonElement> GetVersion()
    {
        await using var factory = new KingApiFactory();
        var response = await factory.WithWebHostBuilder(b => b.UseWebRoot(_webRoot)).CreateClient().GetAsync("/api/version", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement;
    }

    [Fact]
    public async Task The_server_reports_its_build_version()
    {
        var server = (await GetVersion()).GetProperty("server").GetProperty("version").GetString();

        Assert.Equal(AppVersion.Server, server);
        Assert.Matches(VersionFormat(), server);
    }

    [Fact]
    public async Task The_frontend_version_is_the_one_its_build_wrote_into_wwwroot()
    {
        File.WriteAllText(Path.Combine(_webRoot, "version.json"), """{"version":"2026.10.18+f349dc1e5d2a"}""");

        var frontend = (await GetVersion()).GetProperty("frontend").GetProperty("version").GetString();

        Assert.Equal("2026.10.18+f349dc1e5d2a", frontend);
    }

    [Fact]
    public async Task Without_a_frontend_build_its_version_is_null()
    {
        var frontend = (await GetVersion()).GetProperty("frontend").GetProperty("version");

        Assert.Equal(JsonValueKind.Null, frontend.ValueKind);
    }

    [Fact]
    public async Task Telemetry_names_the_version_it_came_from()
    {
        await using var factory = new KingApiFactory();

        var resource = factory.Services.GetRequiredService<TracerProvider>().GetResource();

        Assert.Contains(resource.Attributes, a => a.Key == "service.version" && Equals(a.Value, AppVersion.Server));
    }
}
