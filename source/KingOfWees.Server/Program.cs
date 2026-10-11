using KingOfWees.Server.Admin;
using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
using Microsoft.AspNetCore.HttpOverrides;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.AddSingleton<IPhotoBlobStore, AzurePhotoBlobStore>();

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
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseRateLimiter();
app.UseAuthorization();

app.MapKingEndpoints();
app.MapAdminEndpoints();
app.MapDefaultEndpoints();

app.UseFileServer();
// Deep links like /about load the SPA; unknown /api routes must stay 404s, not return the page.
app.MapFallback("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();
