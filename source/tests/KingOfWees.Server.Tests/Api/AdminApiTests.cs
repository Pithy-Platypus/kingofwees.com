using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using KingOfWees.Server.Admin;

namespace KingOfWees.Server.Tests.Api;

// The admin key: the server holds only its hash, and admin routes don't exist until one is configured.
public sealed class AdminApiTests
{
    private const string AdminKey = "test-admin-key";
    private static readonly string AdminKeyHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(AdminKey)));

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static KingApiFactory WithAdminKey(params (string Key, string Value)[] more) =>
        new(settings: [("King:Admin:KeyHash", AdminKeyHash), .. more]);

    private static Task<HttpResponseMessage> Check(KingApiFactory factory, AuthenticationHeaderValue? authorization)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = authorization;
        return client.GetAsync("/api/admin/check", Ct);
    }

    [Fact]
    public async Task Without_a_configured_key_hash_admin_routes_do_not_exist()
    {
        await using var factory = new KingApiFactory();

        Assert.Equal(HttpStatusCode.NotFound, (await Check(factory, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Check(factory, new("Bearer", AdminKey))).StatusCode);
    }

    [Fact]
    public async Task Check_without_a_key_is_401()
    {
        await using var factory = WithAdminKey();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Check(factory, null)).StatusCode);
    }

    [Theory]
    [InlineData("Bearer", "wrong-key")]
    [InlineData("Bearer", "")]
    [InlineData("Basic", AdminKey)]
    public async Task Check_with_the_wrong_key_or_scheme_is_401(string scheme, string key)
    {
        await using var factory = WithAdminKey();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Check(factory, new(scheme, key))).StatusCode);
    }

    [Fact]
    public async Task Check_with_the_right_key_is_204()
    {
        await using var factory = WithAdminKey();

        Assert.Equal(HttpStatusCode.NoContent, (await Check(factory, new("Bearer", AdminKey))).StatusCode);
    }

    [Fact]
    public async Task An_uppercase_key_hash_works_too()
    {
        await using var factory = new KingApiFactory(settings: [("King:Admin:KeyHash", AdminKeyHash.ToUpperInvariant())]);

        Assert.Equal(HttpStatusCode.NoContent, (await Check(factory, new("Bearer", AdminKey))).StatusCode);
    }

    [Fact]
    public async Task Admin_requests_beyond_the_per_minute_limit_get_429()
    {
        // Wrong keys count too: the limit is what makes guessing slow.
        await using var factory = WithAdminKey(("RateLimiting:AdminPerMinute", "2"));

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await Check(factory, new("Bearer", "wrong-key"))).StatusCode);
        }

        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task Requests_with_the_right_key_are_never_rate_limited()
    {
        // From Wallie's manual test: moderating a burst of spam must not lock the admin out.
        await using var factory = WithAdminKey(("RateLimiting:AdminPerMinute", "2"));

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.NoContent, (await Check(factory, new("Bearer", AdminKey))).StatusCode);
        }
    }

    [Fact]
    public async Task Wrong_keys_are_still_limited_while_the_right_key_is_in_use()
    {
        await using var factory = WithAdminKey(("RateLimiting:AdminPerMinute", "2"));

        var statuses = new List<HttpStatusCode>();
        foreach (var key in new[] { "wrong-key", AdminKey, "wrong-key", AdminKey, "wrong-key" })
        {
            statuses.Add((await Check(factory, new("Bearer", key))).StatusCode);
        }

        Assert.Equal(
            [HttpStatusCode.Unauthorized, HttpStatusCode.NoContent, HttpStatusCode.Unauthorized, HttpStatusCode.NoContent,
             HttpStatusCode.TooManyRequests],
            statuses);
    }

    [Theory]
    [InlineData(AdminKey)] // the key pasted where its hash belongs
    [InlineData("abc123")]
    public async Task A_key_hash_that_is_not_64_hex_characters_stops_the_server_starting(string keyHash)
    {
        await using var factory = new KingApiFactory(settings: [("King:Admin:KeyHash", keyHash)]);

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("King:Admin:KeyHash", error.ToString());
    }

    [Fact]
    public void The_key_tool_and_the_server_hash_the_same_way()
    {
        // The SHA-256 test vector for "abc" (FIPS 180-2), as lowercase hex.
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", AdminKeyHasher.Hash("abc"));
    }

    [Fact]
    public void New_keys_are_random_and_their_hash_matches()
    {
        var (key, hash) = AdminKeyHasher.NewKey();
        var (other, _) = AdminKeyHasher.NewKey();

        Assert.NotEqual(key, other);
        Assert.True(key.Length >= 43); // 32 random bytes
        Assert.Equal(AdminKeyHasher.Hash(key), hash);
    }
}
