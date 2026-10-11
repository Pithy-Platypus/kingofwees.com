#!/usr/bin/env bash
# Creates (or brings up to date) everything kingofwees.com runs on in Azure, beside the DocumentDB cluster.
# Safe to rerun: existing resources are kept; the container app's settings and secrets are re-applied.
# Usage: infra/azure/provision.sh [image]   (default: the app's current image, else this commit's tag)
#
# Reads, never prints:  ~/.kingofwees/documentdb.conn  DocumentDB connection string with /king (required)
#                       ~/.kingofwees/admin-key.hash   admin key hash (optional; no admin routes without it)
#                       ~/.kingofwees/map-center       "latitude,longitude" (optional; no map without it)
set -euo pipefail

SUBSCRIPTION="Playground"
GROUP="kingofwees.com"
LOCATION="eastus"
ENVIRONMENT="kingofwees-env"
APP="kingofwees"
STORAGE="kingofweesbackups"
BACKUPS="backups"
BUDGET="kingofwees-monthly"
BUDGET_AMOUNT=25
REPOSITORY="ghcr.io/pithy-platypus/kingofwees"
SECRETS="$HOME/.kingofwees"

az account set --subscription "$SUBSCRIPTION"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
az group show -n "$GROUP" -o none # the group is Wallie's; this script never creates it

[[ -r "$SECRETS/documentdb.conn" ]] || { echo "Missing $SECRETS/documentdb.conn" >&2; exit 1; }
KING_CONN=$(<"$SECRETS/documentdb.conn")
python3 -I -c 'import sys,urllib.parse as u; sys.exit(0 if u.urlsplit(sys.stdin.read().strip()).path.strip("/") else 1)' \
  <<<"$KING_CONN" || { echo "The connection string must name the database: put /king before the '?'." >&2; exit 1; }
ADMIN_KEY_HASH=$([[ -r "$SECRETS/admin-key.hash" ]] && tr -d '[:space:]' <"$SECRETS/admin-key.hash" || true)
MAP_CENTER=$([[ -r "$SECRETS/map-center" ]] && tr -d '[:space:]' <"$SECRETS/map-center" || true)
export KING_CONN ADMIN_KEY_HASH MAP_CENTER

EXISTING_IMAGE=$(az containerapp show -g "$GROUP" -n "$APP" --query "properties.template.containers[0].image" -o tsv 2>/dev/null || true)
IMAGE=${1:-${EXISTING_IMAGE:-$REPOSITORY:$(git -C "$(dirname "$0")" rev-parse --short=12 HEAD)}}
# Container Apps pulls without credentials, so the package must be public before the app can start.
# Checked before anything is created; GHCR refuses even the anonymous token while the package is private.
anonymous_pull() {
  local token
  token=$(curl -fsS "https://ghcr.io/token?scope=repository:${REPOSITORY#ghcr.io/}:pull") || return 1
  token=$(python3 -I -c 'import json,sys; print(json.load(sys.stdin)["token"])' <<<"$token") || return 1
  curl -fsS -o /dev/null -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json" \
    "https://ghcr.io/v2/${REPOSITORY#ghcr.io/}/manifests/${IMAGE##*:}"
}
anonymous_pull 2>/dev/null \
  || { echo "$IMAGE can't be pulled anonymously: push it with infra/deploy.sh and make the package public first." >&2; exit 1; }

echo "== Container Apps environment $ENVIRONMENT (no Log Analytics workspace)"
if ! az containerapp env show -g "$GROUP" -n "$ENVIRONMENT" -o none 2>/dev/null; then
  az containerapp env create -g "$GROUP" -n "$ENVIRONMENT" -l "$LOCATION" --logs-destination none -o none
fi
# The containerapp extension can return before the environment is provisioned; the app can't be created until it is.
for _ in $(seq 90); do # up to 15 minutes
  STATE=$(az containerapp env show -g "$GROUP" -n "$ENVIRONMENT" --query properties.provisioningState -o tsv)
  [[ "$STATE" == "Succeeded" || "$STATE" == "Failed" ]] && break
  sleep 10
done
[[ "$STATE" == "Succeeded" ]] || {
  echo "Environment $ENVIRONMENT is $STATE: $(az containerapp env show -g "$GROUP" -n "$ENVIRONMENT" --query properties.deploymentErrors -o tsv)" >&2
  echo "A failed environment isn't retried: delete it (az containerapp env delete -g $GROUP -n $ENVIRONMENT --yes) and rerun." >&2
  exit 1
}
ENVIRONMENT_ID=$(az containerapp env show -g "$GROUP" -n "$ENVIRONMENT" --query id -o tsv)

echo "== Storage account $STORAGE for backups (private, blobs deleted after 30 days)"
if ! az storage account show -g "$GROUP" -n "$STORAGE" -o none 2>/dev/null; then
  az storage account create -g "$GROUP" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
    --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false -o none
fi
if ! az storage container-rm show -g "$GROUP" --storage-account "$STORAGE" -n "$BACKUPS" -o none 2>/dev/null; then
  az storage container-rm create -g "$GROUP" --storage-account "$STORAGE" -n "$BACKUPS" --public-access off -o none
fi
az storage account management-policy create -g "$GROUP" --account-name "$STORAGE" -o none --policy '{
  "rules": [{ "name": "delete-after-30-days", "enabled": true, "type": "Lifecycle", "definition": {
    "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["'"$BACKUPS"'/"] },
    "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 30 } } } } }] }'

echo "== Budget $BUDGET: \$$BUDGET_AMOUNT a month on the resource group, emails at 80% actual and 100% forecast"
BUDGET_URL="https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$GROUP/providers/Microsoft.Consumption/budgets/$BUDGET?api-version=2023-05-01"
if ! az rest --method get --url "$BUDGET_URL" -o none 2>/dev/null; then
  EMAIL=$(az account show --query user.name -o tsv) # the signed-in account; kept out of the repo
  az rest --method put --url "$BUDGET_URL" -o none --body '{ "properties": {
    "category": "Cost", "amount": '"$BUDGET_AMOUNT"', "timeGrain": "Monthly",
    "timePeriod": { "startDate": "'"$(date -u +%Y-%m-01)"'" },
    "notifications": {
      "actual80":    { "enabled": true, "operator": "GreaterThan", "threshold": 80,  "thresholdType": "Actual",     "contactEmails": ["'"$EMAIL"'"] },
      "forecast100": { "enabled": true, "operator": "GreaterThan", "threshold": 100, "thresholdType": "Forecasted", "contactEmails": ["'"$EMAIL"'"] } } } }'
fi

echo "== DocumentDB firewall: allow Azure services (the app's outbound addresses are a shared pool of hundreds)"
CLUSTER_ID=$(az resource list -g "$GROUP" --resource-type Microsoft.DocumentDB/mongoClusters --query "[0].id" -o tsv)
az rest --method put -o none \
  --url "https://management.azure.com$CLUSTER_ID/firewallRules/AllowAllAzureServicesAndResourcesWithinAzureIps?api-version=2024-07-01" \
  --body '{ "properties": { "startIpAddress": "0.0.0.0", "endIpAddress": "0.0.0.0" } }'

echo "== Container app $APP"

# Secrets go to az in a file only this user can read, removed on exit — never on a command line.
WORK=$(mktemp -d); chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
APP_ENVIRONMENT_ID="$ENVIRONMENT_ID" APP_IMAGE="$IMAGE" APP_LOCATION="$LOCATION" python3 -I - >"$WORK/app.json" <<'PY'
import json, os
e = os.environ
secrets = [{"name": "king-connection", "value": e["KING_CONN"]}]
env = [{"name": "ConnectionStrings__king", "secretRef": "king-connection"},
       {"name": "King__Proxy__TrustForwardedFor", "value": "true"}]
if e["ADMIN_KEY_HASH"]:
    secrets.append({"name": "admin-key-hash", "value": e["ADMIN_KEY_HASH"]})
    env.append({"name": "King__Admin__KeyHash", "secretRef": "admin-key-hash"})
if e["MAP_CENTER"]:
    latitude, longitude = e["MAP_CENTER"].split(",")
    secrets += [{"name": "map-center-latitude", "value": latitude}, {"name": "map-center-longitude", "value": longitude}]
    env += [{"name": "King__Map__Center__Latitude", "secretRef": "map-center-latitude"},
            {"name": "King__Map__Center__Longitude", "secretRef": "map-center-longitude"}]
probe = lambda kind, path: {"type": kind, "httpGet": {"path": path, "port": 8080},
                            "periodSeconds": 10, "failureThreshold": 3, "timeoutSeconds": 5}
print(json.dumps({
    "location": e["APP_LOCATION"],
    "properties": {
        "managedEnvironmentId": e["APP_ENVIRONMENT_ID"],
        "configuration": {
            "activeRevisionsMode": "Single",
            # One replica only: the rate limits live in memory, so a second replica would double them.
            "ingress": {"external": True, "targetPort": 8080, "transport": "auto", "allowInsecure": False},
            "secrets": secrets,
        },
        "template": {
            "containers": [{"name": "server", "image": e["APP_IMAGE"],
                            "resources": {"cpu": 0.25, "memory": "0.5Gi"}, "env": env,
                            "probes": [probe("Readiness", "/health"), probe("Liveness", "/alive")]}],
            "scale": {"minReplicas": 1, "maxReplicas": 1},
        },
    },
}))
PY
if [[ -n "$EXISTING_IMAGE" ]]; then
  az containerapp update -g "$GROUP" -n "$APP" --yaml "$WORK/app.json" -o none
  # A secret change alone doesn't reach a running revision.
  az containerapp revision restart -g "$GROUP" -n "$APP" \
    --revision "$(az containerapp show -g "$GROUP" -n "$APP" --query properties.latestRevisionName -o tsv)" -o none
else
  az containerapp create -g "$GROUP" -n "$APP" --yaml "$WORK/app.json" -o none
fi

echo "== Done: https://$(az containerapp show -g "$GROUP" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv) ($IMAGE)"
