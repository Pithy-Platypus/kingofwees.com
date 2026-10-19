using System.Reflection;
using System.Text.Json;
using KingOfWees.Server.King;
using KingOfWees.Server.Validation;
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

    public static void MapVersion(this WebApplication app)
    {
        var info = new VersionInfo(new(Server), new(Frontend(app.Environment.WebRootFileProvider)));
        app.MapGroup("/api").AddEndpointFilter<ValidationFilter>().RequireRateLimiting(KingPolicies.Reads)
            .MapGet("/version", () => info);
    }

    private static string? Frontend(IFileProvider files)
    {
        var file = files.GetFileInfo("version.json");
        if (!file.Exists) return null;
        using var stream = file.CreateReadStream();
        return JsonSerializer.Deserialize<ComponentVersion>(stream, Json)?.Version;
    }
}
