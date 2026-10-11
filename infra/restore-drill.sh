#!/usr/bin/env bash
# Restore drill: restores the newest nightly backup into a throwaway local Mongo container and checks it.
# Fails unless every collection holds exactly what mongodump reported dumping and every audit log time is a date (the
# expiry index skips any other type); production's counts now are shown beside them (they drift as people post).
# Usage: infra/restore-drill.sh                       newest backup from Blob storage (az login; Storage Blob Data Reader)
#        infra/restore-drill.sh path/king-….archive.gz  a downloaded backup (its .log beside it)
# Reads, never prints: ~/.kingofwees/documentdb.conn (production's counts; skipped when missing)
set -euo pipefail

SUBSCRIPTION="Playground"
STORAGE="kingofweesbackups"
BACKUPS="backups"
MONGO="mongo:8.0"
CONTAINER="kingofwees-restore-drill-$$"
SECRETS="$HOME/.kingofwees"
scrub() { sed -E 's#//[^/@]*@#//***@#g'; } # mongo tools print the whole connection string when they fail

WORK=$(mktemp -d); trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
if [[ $# -gt 0 ]]; then
  ARCHIVE="$1"; LOG="${1%.archive.gz}.log"
else
  az account set --subscription "$SUBSCRIPTION"
  NAME=$(az storage blob list --auth-mode login --account-name "$STORAGE" -c "$BACKUPS" --prefix king- \
    --query "sort_by([?ends_with(name, '.archive.gz')], &name)[-1].name" -o tsv)
  [[ -n "$NAME" ]] || { echo "No backups in $STORAGE/$BACKUPS." >&2; exit 1; }
  ARCHIVE="$WORK/$NAME"; LOG="${ARCHIVE%.archive.gz}.log"
  for file in "$ARCHIVE" "$LOG"; do
    az storage blob download --auth-mode login --account-name "$STORAGE" -c "$BACKUPS" -n "$(basename "$file")" -f "$file" -o none
  done
fi
echo "== Restoring $(basename "$ARCHIVE") into a throwaway $MONGO container"

docker run -d --name "$CONTAINER" "$MONGO" >/dev/null
until docker exec "$CONTAINER" mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; do sleep 1; done
docker cp "$ARCHIVE" "$CONTAINER:/tmp/dump.archive.gz"
# DocumentDB stores collection and index options plain Mongo refuses (statsEnabled; enableOrderedIndex on the audit log's
# expiry index), so data only. The app sets no collection options and recreates its one index, the audit log's expiry,
# on its first admin sign-in or change (MongoAdminLogStore).
docker exec "$CONTAINER" mongorestore --archive=/tmp/dump.archive.gz --gzip --noOptionsRestore --noIndexRestore

counts() { # prints "collection count" lines for the king database at $1 (a connection string in the environment variable KING_CONN)
  docker exec ${1:+-e KING_CONN} "$CONTAINER" mongosh --nodb --quiet --eval '
    const king = new Mongo(process.env.KING_CONN || "mongodb://localhost").getDB("king");
    for (const c of king.getCollectionNames().sort()) print(c, king.getCollection(c).countDocuments({}));' 2>&1 | scrub
}
DUMPED=$(sed -nE 's/.*done dumping `king\.([^`]+)` \(([0-9]+) documents?\).*/\1 \2/p' "$LOG" | sort)
[[ -n "$DUMPED" ]] || { echo "$(basename "$LOG") reports no collections dumped." >&2; exit 1; }
RESTORED=$(counts) || { echo "FAIL: couldn't count the restored collections: $RESTORED" >&2; exit 1; }
if [[ -r "$SECRETS/documentdb.conn" ]]; then
  PRODUCTION=$(KING_CONN=$(<"$SECRETS/documentdb.conn") counts yes || true) # shown only; a failure prints its (scrubbed) error
else
  PRODUCTION="(no $SECRETS/documentdb.conn)"
fi

echo "== Documents dumped, restored, and in production now"
paste <(echo "$DUMPED") <(echo "$RESTORED") <(echo "$PRODUCTION") | column -t
[[ "$DUMPED" == "$RESTORED" ]] || { echo "FAIL: the restore doesn't hold what was dumped." >&2; exit 1; }

echo "== Audit log times"
docker exec "$CONTAINER" mongosh king --quiet --eval '
  const notDates = db.adminLog.countDocuments({ AtUtc: { $not: { $type: "date" } } });
  if (notDates) { print(`FAIL: ${notDates} adminLog records have a time that is not a date, so they would never expire`); quit(1); }
  print(`ok: ${db.adminLog.countDocuments({})} records, every time a date (the app recreates the expiry index itself)`);'
echo "== Drill passed"
