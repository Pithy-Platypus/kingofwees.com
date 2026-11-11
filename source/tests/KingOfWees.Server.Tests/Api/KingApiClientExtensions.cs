using System.Net.Http.Json;
using System.Text.Json;

namespace KingOfWees.Server.Tests.Api;

// What the API tests do over and over, once: post an entry or a place and keep its id, read a body, read a problem's codes.
internal static class KingApiClientExtensions
{
    /// <summary>A block in the test neighborhood, as every test's spots and sightings use it.</summary>
    public static readonly object Block = new { latitude = 45.523, longitude = -122.677 };

    /// <summary>Posts and answers the new record's id; the response must be a success.</summary>
    public static async Task<string> LogAsync(this HttpClient client, string path, object body, CancellationToken cancellationToken)
    {
        var response = await client.PostAsJsonAsync(path, body, cancellationToken);
        response.EnsureSuccessStatusCode();
        return (await response.JsonAsync(cancellationToken)).GetProperty("id").GetString()!;
    }

    public static Task<string> AddSpotAsync(this HttpClient client, string device, string name, CancellationToken cancellationToken) =>
        client.LogAsync("/api/king/spots", new { reporterKey = device, name, location = Block }, cancellationToken);

    public static Task<string> FeedAsync(
        this HttpClient client, string device, string? spotId, string? name, CancellationToken cancellationToken) =>
        client.LogAsync("/api/king/feedings", new { reporterKey = device, reporterName = name, spotId }, cancellationToken);

    public static Task<string> SeeAsync(this HttpClient client, string device, string? name, CancellationToken cancellationToken) =>
        client.LogAsync("/api/king/sightings", new { reporterKey = device, reporterName = name }, cancellationToken);

    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response, CancellationToken cancellationToken) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);

    /// <summary>Every code in a validation problem, whatever the field.</summary>
    public static IEnumerable<string?> ErrorCodes(this JsonElement problem) =>
        problem.GetProperty("errors").EnumerateObject().SelectMany(p => p.Value.EnumerateArray()).Select(v => v.GetString());
}
