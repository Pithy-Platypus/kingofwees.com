using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.Admin;

// Authenticates "Authorization: Bearer <admin key>" against the configured hash.
public sealed class AdminKeyHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IOptions<AdminOptions> admin)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "AdminKey";

    /// <summary>True when the request carries the configured admin key (also used by the admin rate limit).</summary>
    public static bool CarriesTheKey(HttpRequest request, AdminOptions admin) =>
        PresentedKey(request, admin) is { } key && AdminKeyHasher.Matches(key, admin.KeyHash!);

    // The Bearer value, or null when admin is off or no Bearer key was sent.
    private static string? PresentedKey(HttpRequest request, AdminOptions admin) =>
        admin.IsConfigured
        && AuthenticationHeaderValue.TryParse(request.Headers.Authorization.ToString(), out var header)
        && header.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrEmpty(header.Parameter)
            ? header.Parameter
            : null;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // As the only scheme it is also the default one, so it sees every request, including when admin is off.
        if (PresentedKey(Request, admin.Value) is null)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!CarriesTheKey(Request, admin.Value))
        {
            return Task.FromResult(AuthenticateResult.Fail("Wrong admin key."));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(SchemeName));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
    }
}
