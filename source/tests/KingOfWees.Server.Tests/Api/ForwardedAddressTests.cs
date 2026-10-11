using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using KingOfWees.Server.Admin;

namespace KingOfWees.Server.Tests.Api;

// Behind Container Apps' ingress every request comes from the proxy; the visitor's address is the rightmost
// X-Forwarded-For entry (the ingress appends it to whatever the visitor sent). Rate limits must key on that.
public sealed class ForwardedAddressTests
{
    private const string TrustProxy = "King:Proxy:TrustForwardedFor";
    private const string AdminKey = "forwarded-admin-key";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<HttpStatusCode> PostSighting(KingApiFactory factory, string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/king/sightings")
        {
            Content = JsonContent.Create(new { reporterKey = "k" }),
        };
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        return (await factory.CreateClient().SendAsync(request, Ct)).StatusCode;
    }

    private static async Task<HttpStatusCode> CheckWrongKey(KingApiFactory factory, string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/admin/check");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "wrong-key");
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        return (await factory.CreateClient().SendAsync(request, Ct)).StatusCode;
    }

    [Fact]
    public async Task Behind_the_proxy_each_visitor_gets_their_own_write_limit()
    {
        await using var factory = new KingApiFactory(writesPerMinute: 1, settings: [(TrustProxy, "true")]);

        Assert.Equal(HttpStatusCode.Created, await PostSighting(factory, "198.51.100.1"));
        Assert.Equal(HttpStatusCode.Created, await PostSighting(factory, "198.51.100.2"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await PostSighting(factory, "198.51.100.1"));
    }

    [Fact]
    public async Task A_visitor_cannot_dodge_the_limit_by_sending_their_own_forwarded_address()
    {
        await using var factory = new KingApiFactory(writesPerMinute: 1, settings: [(TrustProxy, "true")]);

        // The visitor sent a made-up address; the ingress appended the real one.
        Assert.Equal(HttpStatusCode.Created, await PostSighting(factory, "203.0.113.1, 198.51.100.1"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await PostSighting(factory, "203.0.113.2, 198.51.100.1"));
    }

    [Fact]
    public async Task Without_the_proxy_setting_forwarded_addresses_are_ignored()
    {
        // Locally nothing sits in front of Kestrel, so the header is whatever the client chose to send.
        await using var factory = new KingApiFactory(writesPerMinute: 1);

        Assert.Equal(HttpStatusCode.Created, await PostSighting(factory, "198.51.100.1"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await PostSighting(factory, "198.51.100.2"));
    }

    [Fact]
    public async Task Behind_the_proxy_wrong_admin_keys_are_limited_per_visitor()
    {
        await using var factory = new KingApiFactory(settings:
        [
            (TrustProxy, "true"),
            ("King:Admin:KeyHash", AdminKeyHasher.Hash(AdminKey)),
            ("RateLimiting:AdminPerMinute", "1"),
        ]);

        Assert.Equal(HttpStatusCode.Unauthorized, await CheckWrongKey(factory, "198.51.100.1"));
        Assert.Equal(HttpStatusCode.Unauthorized, await CheckWrongKey(factory, "198.51.100.2"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await CheckWrongKey(factory, "203.0.113.9, 198.51.100.1"));
    }
}
