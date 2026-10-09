# tools

One-off command-line helpers, run with the .NET SDK — not part of the app or the solution build.

| File | What it does | Run |
|---|---|---|
| `new-admin-key.cs` | Makes a new admin key and its SHA-256 hash with the server's own `AdminKeyHasher` (it references the server project). The key is shown once — keep it in a password manager; only the hash goes in the server's configuration (`King:Admin:KeyHash`). | `dotnet run source/tools/new-admin-key.cs` |

Setup and rotation: `source/README.md` → "Admin key", `infra/README.md` → "Rotating the admin key".
