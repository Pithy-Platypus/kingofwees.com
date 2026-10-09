using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.Admin;

public static class AdminPolicies
{
    public const string Admin = "Admin";
    public const string Requests = "admin";
}

public static class AdminServices
{
    private const int DefaultRequestsPerMinute = 10;

    public static IServiceCollection AddAdmin(this IServiceCollection services)
    {
        services.AddOptions<AdminOptions>()
            .BindConfiguration(AdminOptions.Section)
            .Validate(options => options.IsValid,
                $"{AdminOptions.Section}:{nameof(AdminOptions.KeyHash)} must be the 64-character hex hash printed by source/tools/new-admin-key.cs, not the key itself.")
            .ValidateOnStart();

        services.AddAuthentication()
            .AddScheme<AuthenticationSchemeOptions, AdminKeyHandler>(AdminKeyHandler.SchemeName, configureOptions: null);
        services.AddAuthorizationBuilder()
            .AddPolicy(AdminPolicies.Admin, policy => policy
                .AddAuthenticationSchemes(AdminKeyHandler.SchemeName)
                .RequireAuthenticatedUser());

        // Runs before authorization, so it checks the key itself: the right key is never limited (moderating a burst
        // of spam mustn't lock the admin out), while no key or a wrong one is, which is what makes guessing slow.
        services.AddRateLimiter(options => options.AddPolicy(AdminPolicies.Requests, context =>
        {
            if (AdminKeyHandler.CarriesTheKey(context.Request, context.RequestServices.GetRequiredService<IOptions<AdminOptions>>().Value))
            {
                return RateLimitPartition.GetNoLimiter("admin");
            }

            var permits = context.RequestServices.GetRequiredService<IConfiguration>()
                .GetValue("RateLimiting:AdminPerMinute", DefaultRequestsPerMinute);
            return RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) });
        }));

        return services;
    }
}
