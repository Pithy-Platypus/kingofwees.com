# tools

One-off command-line helpers, run with the .NET SDK — not part of the app or the solution build.

| File | What it does | Run |
|---|---|---|
| `new-admin-key.cs` | Makes a new admin key and its SHA-256 hash with the server's own `AdminKeyHasher` (it references the server project). The key is shown once — keep it in a password manager; only the hash goes in the server's configuration (`King:Admin:KeyHash`). | `dotnet run source/tools/new-admin-key.cs` |

| `seed-local.cs` | Fills the **local** dev database with 45 days of made-up entries (four spots, two meals most days around 7 am and 4 pm, some sightings, two quiet stretches) so `/history` has something to chart. Refuses any host but localhost; rerunning replaces only what it seeded (reporter keys `seed-*`) and leaves your own entries alone. Reads King's street from the server's user-secrets, else uses a stand-in. | `dotnet run source/tools/seed-local.cs -- "<king connection string>"` — with `aspire run` up, copy it from the dashboard's **mongo** resource |

Setup and rotation: `source/README.md` → "Admin key", `infra/README.md` → "Rotating the admin key".
