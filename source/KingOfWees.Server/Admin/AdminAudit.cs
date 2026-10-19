using System.Globalization;
using KingOfWees.Server.King;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.Admin;

// Writes the audit log: when, from which address (the one the rate limits use), and the name typed at sign-in.
public sealed class AdminAudit(IAdminLogStore log, TimeProvider clock)
{
    public const string NameHeader = "X-Admin-Name";

    public Task RecordAsync(HttpContext context, AdminAction action, AdminTouched touched, CancellationToken cancellationToken)
    {
        var at = clock.GetUtcNow();
        return log.AppendAsync(
            new(Guid.CreateVersion7(at).ToString(), at, action, NameOf(context.Request), context.Connection.RemoteIpAddress?.ToString(), touched),
            cancellationToken);
    }

    // Header values must be ASCII, so the page sends the name URL-encoded. Cleaned (DisplayText) and capped like a
    // nickname; missing or blank is "no name". Only ever stored here — never logged or tagged.
    /// <summary>The name typed at sign-in, as recorded in the log (trimmed, cut to a nickname's length); null when none.</summary>
    public static string? NameOf(HttpRequest request)
    {
        var name = DisplayText.Clean(Uri.UnescapeDataString(request.Headers[NameHeader].ToString()));
        if (name is null) return null;
        var text = new StringInfo(name);
        return text.LengthInTextElements <= ReporterRules.MaxNameLength
            ? name
            : text.SubstringByTextElements(0, ReporterRules.MaxNameLength);
    }

    public static AdminTouched Entry(KingEvent entry, Spot? spot) =>
        new(PosterName: entry.ReporterName, EntryKind: entry.Kind, EntryAt: entry.OccurredAt, PlaceName: spot?.Name);
}

// A wrong key on an admin route is a failed sign-in. Recorded here because authorization answers 401 before any
// endpoint or filter runs. Only the Admin policy ever challenges; no key at all isn't an attempt.
public sealed class AdminSignInAudit(AdminAudit audit, IOptions<AdminOptions> admin) : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(
        RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Challenged && AdminKeyHandler.PresentedKey(context.Request, admin.Value) is not null)
        {
            await audit.RecordAsync(context, AdminAction.SignInFailed, new(), context.RequestAborted);
        }
        await _default.HandleAsync(next, context, policy, authorizeResult);
    }
}
