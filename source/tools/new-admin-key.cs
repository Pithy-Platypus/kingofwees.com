#:project ../KingOfWees.Server/KingOfWees.Server.csproj

// Makes a new admin key and its hash with the server's own hasher. Run: dotnet run source/tools/new-admin-key.cs
using KingOfWees.Server.Admin;

var (key, hash) = AdminKeyHasher.NewKey();

// Key first, hash second, each under a plain label: the two look alike, and the wrong one gets pasted.
Console.WriteLine($"""
    KEY: yours. Enter it on /admin and keep it in a password manager. It is not shown again.
    {key}

    HASH: for the server only (King:Admin:KeyHash in user-secrets, King__Admin__KeyHash on a host).
    {hash}
    """);
