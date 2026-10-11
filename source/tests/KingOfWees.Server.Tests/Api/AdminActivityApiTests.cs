using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using KingOfWees.Server.Admin;

namespace KingOfWees.Server.Tests.Api;

// The audit log: every admin action and every wrong key, with when, from which address and the name typed at
// sign-in (a claim, not proof), saying what was touched in words — never a device key.
public sealed class AdminActivityApiTests : IAsyncLifetime
{
    private const string AdminKey = "test-admin-key";
    private const string Neighbor = "neighbor-device-key";
    private const string Spammer = "spammer-device-key";
    private const string AdminAddress = "203.0.113.7";

    // Behind the trusted proxy, so requests carry the address the rate limits use.
    private readonly KingApiFactory _factory = new(settings:
        [("King:Admin:KeyHash", AdminKeyHasher.Hash(AdminKey)), ("King:Proxy:TrustForwardedFor", "true")]);
    private HttpClient _public = null!;
    private HttpClient _admin = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync()
    {
        _public = _factory.CreateClient();
        _admin = Client(AdminKey, "Wallie");
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private HttpClient Client(string? key, string? name, string address = AdminAddress)
    {
        var client = _factory.CreateClient();
        if (key is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        if (name is not null) client.DefaultRequestHeaders.Add("X-Admin-Name", name);
        client.DefaultRequestHeaders.Add("X-Forwarded-For", address);
        return client;
    }

    private async Task<string> Log(string path, object body)
    {
        var response = await _public.PostAsJsonAsync(path, body, Ct);
        response.EnsureSuccessStatusCode();
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString()!;
    }

    private Task<string> AddSpot(string device, string name) =>
        Log("/api/king/spots", new { reporterKey = device, name, location = new { latitude = 45.523, longitude = -122.677 } });

    private async Task Send(HttpMethod method, string path, object? body = null)
    {
        var request = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body) };
        var response = await _admin.SendAsync(request, Ct);
        response.EnsureSuccessStatusCode();
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
    }

    private async Task<(string Body, JsonElement Page)> Activity(string query = "")
    {
        var response = await Client(AdminKey, null).GetAsync($"/api/admin/activity{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(Ct);
        return (body, JsonDocument.Parse(body).RootElement);
    }

    private async Task<JsonElement[]> Records(string query = "") =>
        [.. (await Activity(query)).Page.GetProperty("records").EnumerateArray()];

    private static string? Text(JsonElement element, string property) => element.GetProperty(property).GetString();

    private static string? Touched(JsonElement record, string property) =>
        record.GetProperty("touched").GetProperty(property) is { ValueKind: not JsonValueKind.Null } value ? value.ToString() : null;

    [Fact]
    public async Task Signing_in_is_recorded_with_the_time_the_address_and_the_typed_name()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.GetAsync("/api/admin/check", Ct)).StatusCode);

        var record = Assert.Single(await Records());
        Assert.Equal("signIn", Text(record, "action"));
        Assert.Equal("Wallie", Text(record, "adminName"));
        Assert.Equal(AdminAddress, Text(record, "address"));
        Assert.Equal(_factory.Clock.GetUtcNow(), record.GetProperty("at").GetDateTimeOffset());
    }

    [Fact]
    public async Task A_wrong_key_is_recorded_as_a_failed_sign_in_with_its_address_and_typed_name()
    {
        var response = await Client("wrong-key", "Mallory", "198.51.100.9").GetAsync("/api/admin/check", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var record = Assert.Single(await Records());
        Assert.Equal("signInFailed", Text(record, "action"));
        Assert.Equal("Mallory", Text(record, "adminName"));
        Assert.Equal("198.51.100.9", Text(record, "address"));
    }

    [Fact]
    public async Task A_wrong_key_on_any_admin_route_is_a_failed_sign_in_but_no_key_at_all_is_not_recorded()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client("wrong-key", null).PostAsync("/api/admin/events/x/hide", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(null, "Wallie").GetAsync("/api/admin/check", Ct)).StatusCode);

        var record = Assert.Single(await Records());
        Assert.Equal("signInFailed", Text(record, "action"));
        Assert.Null(Text(record, "adminName"));
    }

    [Fact]
    public async Task A_wrong_key_on_a_public_route_is_not_a_sign_in()
    {
        var client = Client("wrong-key", null);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/king/status", Ct)).StatusCode);
        Assert.Empty(await Records());
    }

    [Theory]
    [InlineData("  Wallie  ", "Wallie")]
    [InlineData("Jos%C3%A9", "José")] // headers are ASCII, so the page sends the name URL-encoded
    [InlineData("   ", null)]
    public async Task The_typed_name_is_decoded_and_trimmed_and_an_empty_one_is_no_name(string sent, string? recorded)
    {
        await Client(AdminKey, sent).GetAsync("/api/admin/check", Ct);

        Assert.Equal(recorded, Text(Assert.Single(await Records()), "adminName"));
    }

    [Fact]
    public async Task A_missing_name_is_recorded_as_no_name()
    {
        await Client(AdminKey, null).GetAsync("/api/admin/check", Ct);

        Assert.Null(Text(Assert.Single(await Records()), "adminName"));
    }

    [Fact]
    public async Task A_long_name_is_cut_to_the_nickname_limit()
    {
        await Client(AdminKey, new string('a', 60)).GetAsync("/api/admin/check", Ct);

        Assert.Equal(new string('a', 40), Text(Assert.Single(await Records()), "adminName"));
    }

    [Fact]
    public async Task Hiding_and_showing_an_entry_record_what_it_was_never_its_device()
    {
        var porch = await AddSpot(Neighbor, "Porch");
        var fedAt = _factory.Clock.GetUtcNow();
        var feeding = await Log("/api/king/feedings", new { reporterKey = Spammer, reporterName = "Sarah", spotId = porch });

        await Send(HttpMethod.Post, $"/api/admin/events/{feeding}/hide");
        await Send(HttpMethod.Delete, $"/api/admin/events/{feeding}/hide");

        var (body, page) = await Activity();
        var records = page.GetProperty("records").EnumerateArray().ToArray();
        Assert.Equal(["showEntry", "hideEntry"], records.Select(r => Text(r, "action")));
        Assert.All(records, r =>
        {
            Assert.Equal("Wallie", Text(r, "adminName"));
            Assert.Equal("fed", Touched(r, "entryKind"));
            Assert.Equal(fedAt, r.GetProperty("touched").GetProperty("entryAt").GetDateTimeOffset());
            Assert.Equal("Sarah", Touched(r, "posterName"));
            Assert.Equal("Porch", Touched(r, "placeName"));
        });
        Assert.DoesNotContain(Spammer, body);
        Assert.DoesNotContain(feeding, body);
    }

    [Fact]
    public async Task Hiding_and_restoring_a_poster_record_their_name_and_counts_never_their_device()
    {
        await AddSpot(Spammer, "Spam spot");
        await Log("/api/king/sightings", new { reporterKey = Spammer, reporterName = "Spammy" });
        var entry = await Log("/api/king/sightings", new { reporterKey = Spammer, reporterName = "Spammy" });

        var hide = await _admin.PostAsync($"/api/admin/events/{entry}/hide-device", null, Ct);
        var hiddenId = (await hide.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetString();
        _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        await Send(HttpMethod.Delete, $"/api/admin/hidden/{hiddenId}");

        var (body, page) = await Activity();
        var records = page.GetProperty("records").EnumerateArray().ToArray();
        Assert.Equal(["restorePoster", "hidePoster"], records.Select(r => Text(r, "action")));
        Assert.All(records, r =>
        {
            Assert.Equal("Spammy", Touched(r, "posterName"));
            Assert.Equal("2", Touched(r, "entries"));
            Assert.Equal("1", Touched(r, "spots"));
        });
        Assert.DoesNotContain(Spammer, body);
    }

    [Fact]
    public async Task Renaming_a_place_records_its_old_and_new_names()
    {
        var porch = await AddSpot(Neighbor, "Porch");

        await Send(HttpMethod.Post, "/api/admin/spots/rename", new { spotId = porch, name = "  Front porch " });

        var record = Assert.Single(await Records());
        Assert.Equal("renamePlace", Text(record, "action"));
        Assert.Equal("Porch", Touched(record, "placeName"));
        Assert.Equal("Front porch", Touched(record, "newName"));
    }

    [Fact]
    public async Task Reads_and_refused_actions_are_not_recorded()
    {
        var porch = await AddSpot(Neighbor, "Porch");

        foreach (var path in new[] { "/api/admin/hidden", "/api/admin/hidden-entries", "/api/admin/spots", "/api/admin/activity" })
        {
            Assert.Equal(HttpStatusCode.OK, (await _admin.GetAsync(path, Ct)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.PostAsync("/api/admin/events/nope/hide", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _admin.PostAsJsonAsync("/api/admin/spots/rename", new { spotId = porch, name = "" }, Ct)).StatusCode);

        Assert.Empty(await Records());
    }

    [Fact]
    public async Task Activity_is_newest_first_in_pages()
    {
        for (var i = 0; i < 3; i++)
        {
            await _admin.GetAsync("/api/admin/check", Ct);
            _factory.Clock.Advance(TimeSpan.FromMinutes(1));
        }
        var all = await Records();

        var (_, first) = await Activity("?limit=2");
        var next = Text(first, "next");
        var (_, second) = await Activity($"?limit=2&before={next}");

        Assert.Equal(3, all.Length);
        Assert.True(all[0].GetProperty("at").GetDateTimeOffset() > all[2].GetProperty("at").GetDateTimeOffset());
        Assert.Equal(all[..2].Select(r => Text(r, "id")), first.GetProperty("records").EnumerateArray().Select(r => Text(r, "id")));
        Assert.Equal([Text(all[2], "id")], second.GetProperty("records").EnumerateArray().Select(r => Text(r, "id")));
        Assert.Equal(JsonValueKind.Null, second.GetProperty("next").ValueKind);
    }

    [Theory]
    [InlineData("?limit=0", "limit", "limit.outOfRange")]
    [InlineData("?limit=101", "limit", "limit.outOfRange")]
    [InlineData("?before=nope", "before", "before.unknown")]
    public async Task Activity_queries_are_validated(string query, string field, string code)
    {
        var response = await _admin.GetAsync($"/api/admin/activity{query}", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("errors");
        Assert.Equal([code], errors.GetProperty(field).EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task Activity_needs_the_key()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _public.GetAsync("/api/admin/activity", Ct)).StatusCode);
    }
}
