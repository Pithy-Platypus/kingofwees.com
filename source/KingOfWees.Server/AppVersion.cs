using System.Reflection;
using System.Text.Json;
using KingOfWees.Server.King;
using Microsoft.Extensions.FileProviders;

namespace KingOfWees.Server;

public sealed record ComponentVersion(string? Version);

/// <summary>What <c>GET /api/version</c> returns. <c>Frontend</c> is the build in wwwroot, null where there is none.</summary>
public sealed record VersionInfo(ComponentVersion Server, ComponentVersion Frontend);

// One version for both halves, from source/version.sh: the build stamps the server's, the frontend build writes
// its own into wwwroot/version.json. Why → docs/patterns/versioning.md.
public static class AppVersion
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string Server { get; } =
        typeof(AppVersion).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion;

    /// <summary>On the validated <c>/api</c> group (<c>Program.cs</c>).</summary>
    public static void MapVersion(this IEndpointRouteBuilder api)
    {
        var files = api.ServiceProvider.GetRequiredService<IWebHostEnvironment>().WebRootFileProvider;
        var info = new VersionInfo(new(Server), new(Frontend(files)));
        api.MapGet("/version", () => info).RequireRateLimiting(KingPolicies.Reads);
    }

    private static string? Frontend(IFileProvider files)
    {
        var file = files.GetFileInfo("version.json");
        if (!file.Exists) return null;
        using var stream = file.CreateReadStream();
        return JsonSerializer.Deserialize<ComponentVersion>(stream, Json)?.Version;
    }
}
