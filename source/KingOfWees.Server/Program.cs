using KingOfWees.Server;
using KingOfWees.Server.Admin;
using KingOfWees.Server.Diagnostics;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Validation;
using Microsoft.AspNetCore.HttpOverrides;
using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

// No request needs more than a few kB except a photo upload, which raises the cap for itself (PhotoRules.MaxRequestBytes).
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Limits.MaxRequestBodySize = 64 * 1024;
    kestrel.AddServerHeader = false;
});

// Add service defaults & Aspire client integrations.
builder.AddServiceDefaults();
// AddMongoDBClient registers the database only when the connection string names one; without it every request is
// a 500. DocumentDB's portal string has no name, so say so at startup.
if (builder.Configuration.GetConnectionString("king") is { } kingConnection
    && string.IsNullOrEmpty(MongoUrl.Create(kingConnection).DatabaseName))
{
    throw new InvalidOperationException(
        "ConnectionStrings:king must name the database: put /king before the '?' (mongodb+srv://host/king?tls=true…).");
}
builder.AddMongoDBClient("king");
// The Blob client reads its connection string only on first use, so a missing one would show only at the first upload.
if (string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("photos")))
{
    throw new InvalidOperationException(
        "ConnectionStrings:photos is missing: the photo container (Endpoint=https://<account>.blob.core.windows.net;ContainerName=photos).");
}
// No health check: /health is the readiness probe, and a photo-storage outage must not take the whole site offline.
builder.AddAzureBlobContainerClient("photos", settings => settings.DisableHealthChecks = true);

// Add services to the container.
builder.Services.AddProblemDetails();
// In Development minimal APIs throw BadHttpRequestException for bad input; keep its 400 instead of a 500.
builder.Services.Configure<ExceptionHandlerOptions>(options =>
    options.StatusCodeSelector = exception => exception is BadHttpRequestException bad
        ? bad.StatusCode
        : StatusCodes.Status500InternalServerError);
// API JSON leaves brotli- or gzip-compressed (a habits answer is thousands of entries). Only JSON: photo files are JPEG,
// and the SPA's scripts and styles are compressed at build time (SpaFiles). EnableForHttps stays off: TLS ends at the
// ingress, so the app always sees plain HTTP in production; locally over HTTPS the JSON leaves plain, which is fine.
// Why → docs/patterns/site-size.md.
builder.Services.AddResponseCompression(options =>
{
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ["application/json", "application/problem+json"];
});
// The provider's default, Fastest (quality 1), left a 500-entry habits answer bigger than gzip's (5.3 vs 4.1 kB);
// Optimal (quality 4) is still cheap on 0.25 vCPU.
builder.Services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Optimal);
builder.Services.AddKing();
builder.Services.AddAdmin();
builder.Services.AddClientDiagnostics();
builder.Services.AddSingleton<IPhotoBlobStore, AzurePhotoBlobStore>();
builder.Services.AddHostedService<PhotoStorageWarmUp>();
builder.Services.AddSingleton<IPhotoStore, MongoPhotoStore>();
builder.Services.AddSingleton<PhotoVisibility>();

var app = builder.Build();

// Behind Container Apps' ingress the connection is the proxy's; the visitor is the rightmost X-Forwarded-For
// entry, which the ingress appends. Only that one hop is trusted, and only when the app runs behind it:
// anywhere Kestrel is reachable directly the header is whatever the client sent.
if (app.Configuration.GetValue<bool>("King:Proxy:TrustForwardedFor"))
{
    var forwarded = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor, ForwardLimit = 1 };
    forwarded.KnownIPNetworks.Clear();
    forwarded.KnownProxies.Clear();
    app.UseForwardedHeaders(forwarded);
}

// Configure the HTTP request pipeline.
app.UseResponseCompression();
app.UseSecurityHeaders();
app.UseExceptionHandler();

app.UseRateLimiter();
app.UseAuthorization();

// The one group every API route nests under: its ValidationFilter validates each handler argument that has a validator.
var api = app.MapGroup("/api").AddEndpointFilter<ValidationFilter>();
api.MapKingEndpoints();
api.MapAdminEndpoints();
api.MapVersion();
api.MapClientDiagnostics();
app.MapDefaultEndpoints();

// Unknown /api routes must stay 404s, not return the page.
app.MapFallback("/api/{**rest}", () => Results.NotFound());
app.MapSpaFiles();

app.Run();
