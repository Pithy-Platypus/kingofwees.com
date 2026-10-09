using System.Text.RegularExpressions;

namespace KingOfWees.Server.Admin;

// Bound from "King:Admin". Only the key's hash is configured, never the key; no hash means no admin routes at all.
public sealed partial class AdminOptions
{
    public const string Section = "King:Admin";

    public string? KeyHash { get; set; }

    public bool IsConfigured => !string.IsNullOrEmpty(KeyHash);

    // Catches the key pasted where its hash belongs: that would otherwise only show as every admin request failing.
    public bool IsValid => !IsConfigured || Sha256Hex().IsMatch(KeyHash!);

    [GeneratedRegex("^[0-9a-fA-F]{64}$")]
    private static partial Regex Sha256Hex();
}
