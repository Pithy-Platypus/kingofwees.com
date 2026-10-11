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
# The SPA layered into the server image; the label connects the GHCR package to the repository.
docker build --platform linux/amd64 -t "$IMAGE" \
  --label org.opencontainers.image.source=https://github.com/Pithy-Platypus/kingofwees.com \
  -f - "$ROOT/source/frontend/dist" <<EOF
FROM kingofwees-server:$TAG
COPY . /app/wwwroot/
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
for _ in $(seq 60); do # up to 5 minutes for the readiness probe (/health, database included)
  [[ "$(az containerapp show -g "$GROUP" -n "$APP" --query properties.latestReadyRevisionName -o tsv)" == "$REVISION" ]] && break
  sleep 5
done
[[ "$(az containerapp show -g "$GROUP" -n "$APP" --query properties.latestReadyRevisionName -o tsv)" == "$REVISION" ]] \
  || { echo "$REVISION never became ready; the previous revision keeps serving if it was healthy." >&2; exit 1; }

"$ROOT/infra/smoke.sh" "https://$(az containerapp show -g "$GROUP" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)"
