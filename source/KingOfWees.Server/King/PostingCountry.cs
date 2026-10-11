using System.Net;
using MaxMind.Db;

namespace KingOfWees.Server.King;

// Bound from "King:Posting". CountryDatabase is an MMDB country file (DB-IP Country Lite in the image); unset = anyone posts.
public sealed class PostingOptions
{
    public const string Section = "King:Posting";

    public string? CountryDatabase { get; set; }

    // Checked at startup: a configured file that can't be read must not quietly open posting to everyone.
    public bool IsValid
    {
        get
        {
            if (string.IsNullOrEmpty(CountryDatabase)) return true;
            try
            {
                using var reader = new Reader(CountryDatabase);
                return true;
            }
            catch (Exception e) when (e is IOException or InvalidDatabaseException or UnauthorizedAccessException)
            {
                return false;
            }
        }
    }
}

// Who may post: anyone, unless a country database is configured; then everyone except a known address outside the US.
public sealed class PostingCountry : IDisposable
{
    private const string AllowedCountry = "US";
    private readonly Reader? _reader;

    public PostingCountry(Microsoft.Extensions.Options.IOptions<PostingOptions> options)
    {
        if (options.Value.CountryDatabase is { Length: > 0 } path) _reader = new Reader(path);
    }

    // Unknown addresses (private, or missing from the database) are allowed: better a stray post than a locked-out neighbor.
    // DB-IP's metadata names itself "DBIP-Country-Lite", so the database type is deliberately never checked. IPv4 addresses in
    // IPv6 form (::ffff:a.b.c.d) are found as they are: both MMDB files map them (checked against each).
    public bool Allows(IPAddress? address)
    {
        if (_reader is null || address is null) return true;
        var record = _reader.Find<Dictionary<string, object>>(address);
        var country = record?.GetValueOrDefault("country") is Dictionary<string, object> c ? c.GetValueOrDefault("iso_code") as string : null;
        return country is null || country == AllowedCountry;
    }

    public void Dispose() => _reader?.Dispose();
}

// On the /api/king writes group, so every write gets it. A filter, not the CanPost policy: a failed policy for an anonymous
// visitor is a 401 challenge (and runs the admin sign-in audit), where this is a plain 403 the page can explain.
public sealed class PostingCountryFilter(PostingCountry posting, KingMetrics metrics) : IEndpointFilter
{
    public const string RefusedCode = "posting.outsideUs";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        if (posting.Allows(context.HttpContext.Connection.RemoteIpAddress)) return await next(context);
        metrics.PostingRefused();
        return TypedResults.Problem(
            statusCode: StatusCodes.Status403Forbidden,
            title: "Posting is open only from the United States.",
            extensions: new Dictionary<string, object?> { ["code"] = RefusedCode });
    }
}
