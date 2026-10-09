using KingOfWees.Server.Admin;
using KingOfWees.Server.King;

var builder = WebApplication.CreateBuilder(args);

// Add service defaults & Aspire client integrations.
builder.AddServiceDefaults();
builder.AddMongoDBClient("king");

// Add services to the container.
builder.Services.AddProblemDetails();
// In Development minimal APIs throw BadHttpRequestException for bad input; keep its 400 instead of a 500.
builder.Services.Configure<ExceptionHandlerOptions>(options =>
    options.StatusCodeSelector = exception => exception is BadHttpRequestException bad
        ? bad.StatusCode
        : StatusCodes.Status500InternalServerError);
builder.Services.AddKing();
builder.Services.AddAdmin();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

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
