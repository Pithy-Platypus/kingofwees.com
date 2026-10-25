#!/usr/bin/env bash
# Runs inside the nightly backup job (the stock mongo image, so no image of ours): dumps the database and uploads the dump
# plus mongodump's log (its per-collection counts are what the restore drill checks against) with the job's managed identity.
# Needs KING_CONN (with /king), BACKUP_URL (https://<account>.blob.core.windows.net/<container>), and the
# IDENTITY_ENDPOINT / IDENTITY_HEADER that Container Apps sets for a managed identity.
set -euo pipefail

NAME="king-$(date -u +%Y-%m-%dT%H%M%SZ)"
cd "$(mktemp -d)"
# The connection string reaches mongodump in a file, never on its command line.
printf 'uri: "%s"\n' "$KING_CONN" >dump.yaml
# DocumentDB answers as a mongos, so mongodump 100.19 always warns about a "non-primary readPreference": it compares
# pointers, not modes (mongodump.go, Init). The dump does read from the primary.
# A failing mongodump prints the whole connection string, password included: blank the credentials before anything is shown or kept.
mongodump --config=dump.yaml --readPreference=primary --gzip --archive="$NAME.archive.gz" 2>&1 \
  | sed -E 's#//[^/@]*@#//***@#g' | tee "$NAME.log"

# mongosh brings Node (fetch, fs), so the upload needs nothing the image lacks.
BACKUP_FILES="$NAME.archive.gz $NAME.log" mongosh --nodb --quiet --eval '(async () => {
const fs = require("fs"), env = process.env;
const identity = await fetch(`${env.IDENTITY_ENDPOINT}?resource=https://storage.azure.com/&api-version=2019-08-01`,
  { headers: { "X-IDENTITY-HEADER": env.IDENTITY_HEADER } });
if (!identity.ok) throw new Error(`managed identity token: ${identity.status}`);
const { access_token } = await identity.json();
for (const file of env.BACKUP_FILES.split(" ")) {
  const put = await fetch(`${env.BACKUP_URL}/${file}`, { method: "PUT", body: fs.readFileSync(file),
    headers: { Authorization: `Bearer ${access_token}`, "x-ms-version": "2023-11-03", "x-ms-blob-type": "BlockBlob" } });
  if (put.status !== 201) throw new Error(`${file}: ${put.status} ${await put.text()}`);
  print(`uploaded ${file}`);
}
})()'

# A dump that "succeeds" with nothing in it is the one failure nobody would see: King's history is never empty, and the
# archive of a real one is a few KB (2,850 bytes on 2026-10-25). Checked after the upload, so the log is there to read;
# a failed run fires the backup-failed alert.
grep -qE 'done dumping `king\.events` \([1-9][0-9]* documents\)' "$NAME.log" \
  || { echo "The dump holds no entries (king.events): see $NAME.log" >&2; exit 1; }
[[ $(wc -c <"$NAME.archive.gz") -ge 1000 ]] \
  || { echo "The archive is only $(wc -c <"$NAME.archive.gz") bytes: see $NAME.log" >&2; exit 1; }
