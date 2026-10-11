#!/usr/bin/env bash
# Builds the image for this commit, pushes it to GHCR and rolls the container app onto it.
# Usage: infra/deploy.sh   (needs `docker login ghcr.io`; the app itself comes from infra/azure/provision.sh)
set -euo pipefail

SUBSCRIPTION="Playground"
GROUP="kingofwees.com"
APP="kingofwees"
REPOSITORY="ghcr.io/pithy-platypus/kingofwees"
ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)

[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "Commit or stash first: the image is tagged with the commit." >&2; exit 1; }
TAG=$(git -C "$ROOT" rev-parse --short=12 HEAD)
IMAGE="$REPOSITORY:$TAG"

echo "== Building $IMAGE (linux/amd64)"
(cd "$ROOT/source/frontend" && bun run build)
dotnet publish "$ROOT/source/KingOfWees.Server" -c Release -r linux-x64 -t:PublishContainer \
  -p:ContainerRepository=kingofwees-server -p:ContainerImageTag="$TAG"
# The country database behind US-only posting: DB-IP Country Lite (CC BY 4.0, credited in the site footer), this month's,
# or last month's early in a month before the new one is out. Downloaded at each deploy, never kept in the repo.
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -R "$ROOT/source/frontend/dist" "$STAGE/wwwroot"
for MONTH in "$(date -u +%Y-%m)" "$(date -u -v-1m +%Y-%m)"; do # -v is macOS date: the script runs on Wallie's Mac
  curl -fsSL "https://download.db-ip.com/free/dbip-country-lite-$MONTH.mmdb.gz" | gunzip > "$STAGE/dbip-country-lite.mmdb" && break
done
[[ -s "$STAGE/dbip-country-lite.mmdb" ]] || { echo "Couldn't download the DB-IP country database." >&2; exit 1; }

# The SPA and the country database layered into the server image; the label connects the GHCR package to the repository.
# The server refuses to start if the setting names a file it can't read, so a bad layer shows at deploy.
docker build --platform linux/amd64 -t "$IMAGE" \
  --label org.opencontainers.image.source=https://github.com/Pithy-Platypus/kingofwees.com \
  -f - "$STAGE" <<EOF
FROM kingofwees-server:$TAG
COPY wwwroot /app/wwwroot/
COPY dbip-country-lite.mmdb /app/geo/
ENV King__Posting__CountryDatabase=/app/geo/dbip-country-lite.mmdb
EOF

echo "== Pushing $IMAGE"
docker push "$IMAGE"

az account set --subscription "$SUBSCRIPTION"
if ! az containerapp show -g "$GROUP" -n "$APP" -o none 2>/dev/null; then
  echo "Pushed. No container app yet: make the package public, then run infra/azure/provision.sh $IMAGE"
  exit 0
fi

echo "== Rolling $APP onto $TAG"
az containerapp update -g "$GROUP" -n "$APP" --image "$IMAGE" -o none
REVISION=$(az containerapp show -g "$GROUP" -n "$APP" --query properties.latestRevisionName -o tsv)
# latestReadyRevisionName names a revision whose readiness probe still fails; only the container's ready flag reflects it.
ready() { [[ "$(az containerapp replica list -g "$GROUP" -n "$APP" --revision "$REVISION" \
  --query "length([].properties.containers[?ready==\`true\`][]) > \`0\` && length([].properties.containers[?ready!=\`true\`][]) == \`0\`" -o tsv)" == "true" ]]; }
for _ in $(seq 60); do # up to 5 minutes for the readiness probe (/health, database included)
  ready && break
  sleep 5
done
ready || { echo "$REVISION never became ready (/health failing?); the previous revision keeps serving if it was healthy." >&2; exit 1; }

# The public domain once it's bound (that checks its certificate too), else the Container Apps address.
HOST=$(az containerapp show -g "$GROUP" -n "$APP" --query "properties.configuration.ingress.customDomains[?name=='kingofwees.com'].name | [0]" -o tsv)
"$ROOT/infra/smoke.sh" "https://${HOST:-$(az containerapp show -g "$GROUP" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)}"
