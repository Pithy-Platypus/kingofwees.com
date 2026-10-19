using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FluentValidation;
using KingOfWees.Server.Photos;
using OpenTelemetry.Metrics;

namespace KingOfWees.Server.King;

public static class KingPolicies
{
    // Allows everyone today; the single switch for "invite to post" later.
    public const string CanPost = "CanPost";
    public const string Writes = "writes";
    public const string Reads = "reads";
    // Apart from other reads: one page of /photos is 50 thumbnails.
    public const string PhotoFiles = "photo-files";
    // Uploads at once, every visitor together (the global limiter).
    public const string PhotoUploads = "photo-uploads";
}

public static class KingServices
{
    private const int DefaultWritesPerMinute = 20;
    private const int DefaultReadsPerMinute = 120;
    private const int DefaultPhotoFilesPerMinute = 600;
    private const int DefaultPhotoUploadsAtOnce = 4;

    public static IServiceCollection AddKing(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IKingEventStore, MongoKingEventStore>();
        services.AddSingleton<ISpotStore, MongoSpotStore>();
        services.AddSingleton<IHiddenReporterStore, MongoHiddenReporterStore>();
        services.AddSingleton<KingMetrics>();
        services.AddOptions<MapOptions>().BindConfiguration(MapOptions.Section);
        services.AddOptions<PostingOptions>()
            .BindConfiguration(PostingOptions.Section)
            .Validate(options => options.IsValid,
                $"{PostingOptions.Section}:{nameof(PostingOptions.CountryDatabase)} names a file that can't be read as an MMDB country database.")
            .ValidateOnStart();
        services.AddSingleton<PostingCountry>();
        services.ConfigureOpenTelemetryMeterProvider(metrics => metrics.AddMeter(KingMetrics.MeterName));

        services.ConfigureHttpJsonOptions(options =>
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));
        services.AddValidatorsFromAssemblyContaining<KingEvent>(ServiceLifetime.Singleton);

        services.AddAuthorizationBuilder()
            .AddPolicy(KingPolicies.CanPost, policy => policy.RequireAssertion(_ => true));

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(KingPolicies.Writes, context => PerVisitor(context, "RateLimiting:WritesPerMinute", DefaultWritesPerMinute));
            options.AddPolicy(KingPolicies.Reads, context => PerVisitor(context, "RateLimiting:ReadsPerMinute", DefaultReadsPerMinute));
            options.AddPolicy(KingPolicies.PhotoFiles,
                context => PerVisitor(context, "RateLimiting:PhotoFilesPerMinute", DefaultPhotoFilesPerMinute));
            // Each upload is held in memory (a few MB) on a 0.5 GiB app, so only a few run at once across every visitor;
            // no queue, the next one gets 429. The global limiter runs before, and as well as, each endpoint's own policy.
            // Read at the first upload: a changed setting applies after a restart (in Container Apps, a new revision).
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                context.GetEndpoint()?.Metadata.GetMetadata<PhotoUploadEndpoint>() is null
                    ? RateLimitPartition.GetNoLimiter(string.Empty)
                    : RateLimitPartition.GetConcurrencyLimiter(KingPolicies.PhotoUploads, _ => new ConcurrencyLimiterOptions
                    {
                        PermitLimit = context.RequestServices.GetRequiredService<IConfiguration>()
                            .GetValue("RateLimiting:PhotoUploadsAtOnce", DefaultPhotoUploadsAtOnce),
                        QueueLimit = 0,
                    }));
        });

        return services;
    }

    private static RateLimitPartition<string> PerVisitor(HttpContext context, string setting, int defaultPermits)
    {
        // Read per request so configuration (and tests) can change the limit.
        var permits = context.RequestServices.GetRequiredService<IConfiguration>().GetValue(setting, defaultPermits);
        return RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) });
    }
}
