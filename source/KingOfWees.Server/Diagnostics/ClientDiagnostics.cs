using System.Threading.RateLimiting;
using FluentValidation;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.Http.HttpResults;

namespace KingOfWees.Server.Diagnostics;

// What the browser reports when the page itself breaks (a script error, a promise nobody caught, a screen that failed to
// draw). Logged as one warning and stored nowhere, so it isn't a public write: open to every country, outside the
// /api/king writes group. Why → docs/patterns/telemetry.md.
public sealed record ClientDiagnostic(string? Kind, string? Message, string? Stack, string? Path, string? Version)
{
    public const int MaxMessageLength = 500;
    public const int MaxStackLength = 4000;
    public const int MaxPathLength = 200;
    public const int MaxVersionLength = 64;

    public static readonly IReadOnlySet<string> Kinds = new HashSet<string> { "error", "rejection", "render" };

    public string? CleanMessage => DisplayText.Clean(Message);

    public string? CleanPath => DisplayText.Clean(Path);

    public string? CleanVersion => DisplayText.Clean(Version);

    // Line by line: the line breaks are what make a stack readable.
    public string? CleanStack => Stack is null
        ? null
        : string.Join('\n', Stack.Split('\n').Select(CleanLine).Where(line => line.Length > 0)) is { Length: > 0 } stack
            ? stack
            : null;

    // Clean trims, so a frame gets its indent back.
    private static string CleanLine(string line) =>
        DisplayText.Clean(line) is { } text ? new string(' ', line.Length - line.TrimStart(' ').Length) + text : "";
}

public sealed class ClientDiagnosticValidator : AbstractValidator<ClientDiagnostic>
{
    public ClientDiagnosticValidator()
    {
        RuleFor(d => d.Kind)
            .NotEmpty().WithErrorCode("kind.required")
            .Must(kind => ClientDiagnostic.Kinds.Contains(kind!)).WithErrorCode("kind.unknown")
            .When(d => !string.IsNullOrEmpty(d.Kind), ApplyConditionTo.CurrentValidator);
        RuleFor(d => d.CleanMessage)
            .NotEmpty().WithErrorCode("message.required")
            .MaximumLength(ClientDiagnostic.MaxMessageLength).WithErrorCode("message.tooLong")
            .OverridePropertyName(nameof(ClientDiagnostic.Message));
        RuleFor(d => d.CleanStack)
            .MaximumLength(ClientDiagnostic.MaxStackLength).WithErrorCode("stack.tooLong")
            .OverridePropertyName(nameof(ClientDiagnostic.Stack));
        // The page's path only: a query string can carry what a visitor typed.
        RuleFor(d => d.CleanPath)
            .NotEmpty().WithErrorCode("path.required")
            .Must(path => path!.StartsWith('/') && !path.Contains('?') && !path.Contains('#')).WithErrorCode("path.invalid")
            .When(d => d.CleanPath is not null, ApplyConditionTo.CurrentValidator)
            .MaximumLength(ClientDiagnostic.MaxPathLength).WithErrorCode("path.tooLong")
            .OverridePropertyName(nameof(ClientDiagnostic.Path));
        RuleFor(d => d.CleanVersion)
            .MaximumLength(ClientDiagnostic.MaxVersionLength).WithErrorCode("version.tooLong")
            .OverridePropertyName(nameof(ClientDiagnostic.Version));
    }
}

// Every visitor together: a flood from many addresses mustn't spend the workspace's daily cap (and blind telemetry for
// the rest of the day). Read at the first report: a changed setting applies after a restart.
public sealed class ClientDiagnosticsBudget(IConfiguration configuration) : IDisposable
{
    private readonly FixedWindowRateLimiter _limiter = new(new FixedWindowRateLimiterOptions
    {
        PermitLimit = configuration.GetValue("RateLimiting:ClientDiagnosticsTotalPerMinute", ClientDiagnosticsEndpoints.DefaultTotalPerMinute),
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
    });

    public bool TryTake()
    {
        using var lease = _limiter.AttemptAcquire();
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}

public static partial class ClientDiagnosticsEndpoints
{
    public const string Policy = "client-diagnostics";
    public const int DefaultPerMinute = 10;
    public const int DefaultTotalPerMinute = 120;

    public static IServiceCollection AddClientDiagnostics(this IServiceCollection services)
    {
        services.AddSingleton<ClientDiagnosticsBudget>();
        services.AddRateLimiter(options => options.AddPolicy(Policy, context =>
        {
            var permits = context.RequestServices.GetRequiredService<IConfiguration>()
                .GetValue("RateLimiting:ClientDiagnosticsPerMinute", DefaultPerMinute);
            return RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) });
        }));
        return services;
    }

    public static void MapClientDiagnostics(this WebApplication app) =>
        app.MapGroup("/api").AddEndpointFilter<ValidationFilter>()
            .MapPost("/client-diagnostics", Report).RequireRateLimiting(Policy);

    private static Results<NoContent, StatusCodeHttpResult> Report(
        ClientDiagnostic diagnostic, ClientDiagnosticsBudget budget, ILogger<ClientDiagnostic> logger)
    {
        if (!budget.TryTake()) return TypedResults.StatusCode(StatusCodes.Status429TooManyRequests);
        BrowserFailed(logger, diagnostic.Kind!, diagnostic.CleanPath!, diagnostic.CleanVersion, diagnostic.CleanMessage!, diagnostic.CleanStack);
        return TypedResults.NoContent();
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Browser {Kind} on {Path} ({Version}): {Message}\n{Stack}")]
    private static partial void BrowserFailed(ILogger logger, string kind, string path, string? version, string message, string? stack);
}
