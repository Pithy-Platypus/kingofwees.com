using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

namespace KingOfWees.Server.Admin;

// The one way admin keys are hashed: the server checks keys with it, and source/tools/new-admin-key.cs makes them with it.
public static class AdminKeyHasher
{
    public static string Hash(string key) => Convert.ToHexStringLower(HashBytes(key));

    /// <param name="keyHash">64 hex characters, either case (startup validation guarantees it).</param>
    public static bool Matches(string key, string keyHash) =>
        CryptographicOperations.FixedTimeEquals(HashBytes(key), Convert.FromHexString(keyHash));

    // 32 random bytes as URL-safe Base64, so the key pastes cleanly anywhere.
    public static (string Key, string Hash) NewKey()
    {
        var key = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        return (key, Hash(key));
    }

    private static byte[] HashBytes(string key) => SHA256.HashData(Encoding.UTF8.GetBytes(key));
}
