using KingOfWees.Server;
using KingOfWees.Server.Admin;
using KingOfWees.Server.Diagnostics;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
using Microsoft.AspNetCore.HttpOverrides;
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
builder.Services.AddKing();
builder.Services.AddAdmin();
builder.Services.AddClientDiagnostics();
builder.Services.AddSingleton<IPhotoBlobStore, AzurePhotoBlobStore>();
builder.Services.AddSingleton<IPhotoStore, MongoPhotoStore>();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

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
app.UseSecurityHeaders();
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseRateLimiter();
app.UseAuthorization();

app.MapKingEndpoints();
app.MapAdminEndpoints();
app.MapVersion();
app.MapClientDiagnostics();
app.MapDefaultEndpoints();

// Unknown /api routes must stay 404s, not return the page.
app.MapFallback("/api/{**rest}", () => Results.NotFound());
app.MapSpaFiles();

app.Run();
