#:project ../KingOfWees.Server/KingOfWees.Server.csproj

// Fills the LOCAL dev database with 45 days of made-up entries so /history has something to chart.
// Run (with `aspire run` up; the connection string is on the dashboard's mongo resource):
//   dotnet run source/tools/seed-local.cs -- "mongodb://admin:<password>@localhost:<port>/king?authSource=admin&authMechanism=SCRAM-SHA-256"
// Refuses any host but localhost. Rerunning replaces only what it seeded (reporter keys starting "seed-"); your own entries stay.
using System.Text.Json;
using KingOfWees.Server.King;
using MongoDB.Bson;
using MongoDB.Driver;

if (args is not [var connection])
{
    Console.Error.WriteLine("Usage: dotnet run source/tools/seed-local.cs -- \"<the king connection string from the Aspire dashboard's mongo resource>\"");
    return 2;
}

var url = new MongoUrl(connection);
if (url.Server.Host is not ("localhost" or "127.0.0.1" or "::1"))
{
    Console.Error.WriteLine($"Refusing to seed {url.Server.Host}: this tool is for the local dev database only.");
    return 1;
}

// King's street from the server's user-secrets (source/README.md → "Map center"); a stand-in when it isn't set.
var center = MapCenterFromUserSecrets() ?? new GeoPoint(45.523, -122.677);
var now = DateTime.Now;
var random = new Random(2026); // the same data every run

var db = new MongoClient(url).GetDatabase(url.DatabaseName ?? "king");
var events = db.GetCollection<BsonDocument>("events");
var spots = db.GetCollection<BsonDocument>("spots");
var seeded = Builders<BsonDocument>.Filter.Regex("ReporterKey", new BsonRegularExpression("^seed-"));
var removed = (await events.DeleteManyAsync(seeded)).DeletedCount + (await spots.DeleteManyAsync(seeded)).DeletedCount;

(string Key, string? Name)[] neighbors = [("seed-neighbor-1", "Sunny"), ("seed-neighbor-2", "Dev"), ("seed-neighbor-3", null), ("seed-neighbor-4", "the Capps")];
(string Id, string Name, GeoPoint Place)[] places =
[
    ("seed-spot-porch", "The porch", center),
    ("seed-spot-elm", "Elm & Earle St.", Shift(center, 0.002, 0.003)),
    ("seed-spot-store", "The corner store", Shift(center, -0.003, 0.001)),
    ("seed-spot-guy", "Boundary & Guy St.", Shift(center, 0.004, -0.002)),
];
await spots.InsertManyAsync(places.Select(p => new BsonDocument
{
    ["_id"] = p.Id,
    ["Name"] = p.Name,
    ["Latitude"] = p.Place.Latitude,
    ["Longitude"] = p.Place.Longitude,
    ["CreatedAtUtc"] = now.AddDays(-60).ToUniversalTime(),
    ["ReporterKey"] = "seed-neighbor-1",
}));

var docs = new List<BsonDocument>();
for (var back = 44; back >= 0; back--)
{
    var day = now.Date.AddDays(-back);
    // Two quiet stretches break the runs on the calendar: nothing 20–21 days ago, nothing 9 days ago.
    var quiet = back is 20 or 21 or 9;
    if (!quiet && random.NextDouble() < 0.9) Feeding(day.AddHours(6.5 + random.NextDouble() * 2));
    if (!quiet && random.NextDouble() < 0.8) Feeding(day.AddHours(15.5 + random.NextDouble() * 2.5));
    if (random.NextDouble() < 0.35) Sighting(day.AddHours(11 + random.NextDouble() * 8));
    if (back % 11 == 3) Sighting(day.AddHours(21.25)); // an hour with only sightings
}
await events.InsertManyAsync(docs);

Console.WriteLine($"""
    Seeded the local database at {url.Server} ({db.DatabaseNamespace.DatabaseName}): {places.Length} spots and {docs.Count} entries over 45 days,
    replacing {removed} seeded documents from an earlier run. Your own entries were left alone.
    Center used: {center.Latitude}, {center.Longitude}{(MapCenterFromUserSecrets() is null ? " (stand-in: set King:Map:Center in user-secrets to use your street)" : "")}.
    """);
return 0;

void Feeding(DateTime at)
{
    if (at > now) return;
    var roll = random.NextDouble();
    string[] foods = roll < 0.7 ? ["Wet", "Treats"] : roll < 0.85 ? ["Treats"] : roll < 0.95 ? ["Wet"] : ["Dry"];
    var spot = random.NextDouble() < 0.85 ? places[0] : places[random.Next(1, places.Length)];
    docs.Add(Entry(at, "Fed", foods, sawKing: random.NextDouble() >= 0.1, spot.Id, location: null));
}

void Sighting(DateTime at)
{
    if (at > now) return;
    var place = Shift(center, (random.NextDouble() - 0.5) * 0.008, (random.NextDouble() - 0.5) * 0.008);
    docs.Add(Entry(at, "Seen", [], sawKing: true, spotId: null, place));
}

BsonDocument Entry(DateTime at, string kind, string[] foods, bool sawKing, string? spotId, GeoPoint? location)
{
    var utc = at.ToUniversalTime();
    var (key, name) = neighbors[random.Next(neighbors.Length)];
    return new BsonDocument
    {
        ["_id"] = Guid.CreateVersion7(new DateTimeOffset(utc)).ToString(),
        ["Kind"] = kind,
        ["OccurredAtUtc"] = utc,
        ["ReporterKey"] = key,
        ["ReporterName"] = name is null ? BsonNull.Value : name,
        ["Foods"] = new BsonArray(foods),
        ["SawKing"] = sawKing,
        ["SpotId"] = spotId is null ? BsonNull.Value : spotId,
        ["Latitude"] = location is null ? BsonNull.Value : location.Latitude,
        ["Longitude"] = location is null ? BsonNull.Value : location.Longitude,
        ["Hidden"] = false,
    };
}

static GeoPoint Shift(GeoPoint from, double latitude, double longitude) => new(from.Latitude + latitude, from.Longitude + longitude);

// The server's user-secrets file, read directly: "King:Map:Center:Latitude" / "...Longitude" (source/README.md → "Map center").
static GeoPoint? MapCenterFromUserSecrets()
{
    var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".microsoft", "usersecrets", "36988aa0-ee8c-43eb-a734-7acedc835366", "secrets.json");
    if (!File.Exists(path)) return null;
    using var json = JsonDocument.Parse(File.ReadAllText(path));
    double? Read(string key) =>
        json.RootElement.TryGetProperty(key, out var v) && double.TryParse(v.GetString(), System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;
    return Read("King:Map:Center:Latitude") is { } lat && Read("King:Map:Center:Longitude") is { } lon ? new GeoPoint(lat, lon) : null;
}
