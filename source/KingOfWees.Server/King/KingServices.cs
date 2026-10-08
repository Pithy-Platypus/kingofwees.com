using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FluentValidation;
using OpenTelemetry.Metrics;

namespace KingOfWees.Server.King;

public static class KingPolicies
{
    // Allows everyone today; the single switch for "invite to post" later.
    public const string CanPost = "CanPost";
    public const string Writes = "writes";
}

public static class KingServices
{
    private const int DefaultWritesPerMinute = 20;

    public static IServiceCollection AddKing(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IKingEventStore, MongoKingEventStore>();
        services.AddSingleton<KingMetrics>();
        services.ConfigureOpenTelemetryMeterProvider(metrics => metrics.AddMeter(KingMetrics.MeterName));

        services.ConfigureHttpJsonOptions(options =>
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));
        services.AddValidatorsFromAssemblyContaining<KingEvent>(ServiceLifetime.Singleton);

        services.AddAuthorizationBuilder()
            .AddPolicy(KingPolicies.CanPost, policy => policy.RequireAssertion(_ => true));

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(KingPolicies.Writes, context =>
            {
                // Read per request so configuration (and tests) can change the limit.
                var permits = context.RequestServices.GetRequiredService<IConfiguration>()
                    .GetValue("RateLimiting:WritesPerMinute", DefaultWritesPerMinute);
                return RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) });
            });
        });

        return services;
    }
}
