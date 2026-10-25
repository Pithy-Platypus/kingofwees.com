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
DOMAIN="kingofwees.com" # and www.$DOMAIN; records at Cloudflare, DNS only (infra/README.md)
STORAGE="kingofweesbackups"
BACKUPS="backups"
# Photos in their own account: soft delete is per account, and the backups' 30-day delete rule must never touch photos.
PHOTOS_STORAGE="kingofweesphotos"
PHOTOS="photos"
PHOTOS_SOFT_DELETE_DAYS=30 # a deleted photo (an undo, a mistake) can be recovered this long; photos aren't in the nightly dump
BACKUPS_SOFT_DELETE_DAYS=30 # a deleted or overwritten archive can be recovered this long (its own copy of the database)
BACKUP_JOB="kingofwees-backup"
# The stock image (mongodump, and mongosh for the upload), pinned so a new tag can't change what runs nightly.
BACKUP_IMAGE="docker.io/library/mongo:8.0@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907"
BACKUP_CRON="0 8 * * *" # UTC: 3–4 a.m. in Boston
BUDGET="kingofwees-monthly"
BUDGET_AMOUNT=25
WORKSPACE="kingofwees-logs"
WORKSPACE_DAILY_GB=0.05 # ~1.5 GB a month at most, inside the 5 GB a month free per billing account
INSIGHTS="kingofwees-insights"
ALERTS="kingofwees-alerts"
BACKUP_ALERT="kingofwees-backup-failed"
SEEN_ALERT="kingofwees-king-seen-or-fed"
PHOTO_ALERT="kingofwees-photo-posted"
ERROR_ALERT="kingofwees-server-errors"
CAP_ALERT="kingofwees-telemetry-capped"
BROWSER_ALERT="kingofwees-browser-errors"
UP_TEST="kingofwees-up"                       # the site checked from outside
DOWN_ALERT="kingofwees-down"
RESTART_ALERT="kingofwees-restarted"
MEMORY_ALERT="kingofwees-memory-high"
BACKUP_MISSING_ALERT="kingofwees-backup-missing"
WORKBOOK="2b7c5e9a-4d1f-4c8e-9a3b-6f0e2d1c7a55" # workbook resources are named by a UUID; this one is "King of Wees"
REPOSITORY="ghcr.io/pithy-platypus/kingofwees"
SECRETS="$HOME/.kingofwees"

az account set --subscription "$SUBSCRIPTION"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
az group show -n "$GROUP" -o none # the group is Wallie's; this script never creates it
EMAIL=$(az account show --query user.name -o tsv) # the signed-in account gets budget and backup alerts; kept out of the repo

[[ -r "$SECRETS/documentdb.conn" ]] || { echo "Missing $SECRETS/documentdb.conn" >&2; exit 1; }
KING_CONN=$(<"$SECRETS/documentdb.conn")
python3 -I -c 'import sys,urllib.parse as u; sys.exit(0 if u.urlsplit(sys.stdin.read().strip()).path.strip("/") else 1)' \
  <<<"$KING_CONN" || { echo "The connection string must name the database: put /king before the '?'." >&2; exit 1; }
ADMIN_KEY_HASH=$([[ -r "$SECRETS/admin-key.hash" ]] && tr -d '[:space:]' <"$SECRETS/admin-key.hash" || true)
MAP_CENTER=$([[ -r "$SECRETS/map-center" ]] && tr -d '[:space:]' <"$SECRETS/map-center" || true)
# Not exported: only the two Python processes below get them, inline — every other command's environment stays clean.

EXISTING_IMAGE=$(az containerapp show -g "$GROUP" -n "$APP" --query "properties.template.containers[0].image" -o tsv 2>/dev/null || true)
IMAGE=${1:-${EXISTING_IMAGE:-$REPOSITORY:$(git -C "$(dirname "$0")" rev-parse --short=12 HEAD)}}
# Telemetry leaves only through the app's own exporter now: an image from before it would run with none at all.
git -C "$(dirname "$0")" show "${IMAGE##*:}:source/KingOfWees.Server/Extensions.cs" 2>/dev/null | grep -q AddAzureMonitorTraceExporter \
  || { echo "$IMAGE has no Azure Monitor exporter (or its commit isn't here): deploy a newer one with infra/deploy.sh first." >&2; exit 1; }
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

echo "== Container Apps environment $ENVIRONMENT (console logs not kept; telemetry goes to Application Insights below)"
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

echo "== Telemetry: the app's own exporter to $INSIGHTS (workspace $WORKSPACE, ${WORKSPACE_DAILY_GB} GB a day cap)"
# Not the environment's OpenTelemetry agent: it left every request's ResultCode 0 and Success true. Memory, CPU and restarts
# are the container app's platform metrics (portal → Metrics). Why → docs/patterns/telemetry.md.
az monitor log-analytics workspace create -g "$GROUP" -n "$WORKSPACE" -l "$LOCATION" --sku PerGB2018 \
  --retention-time 31 --quota "$WORKSPACE_DAILY_GB" -o none
if ! az monitor app-insights component show -g "$GROUP" --app "$INSIGHTS" -o none 2>/dev/null; then
  az monitor app-insights component create -g "$GROUP" --app "$INSIGHTS" -l "$LOCATION" --kind web --application-type web \
    --workspace "$(az monitor log-analytics workspace show -g "$GROUP" -n "$WORKSPACE" --query id -o tsv)" -o none
fi
INSIGHTS_CONN=$(az monitor app-insights component show -g "$GROUP" --app "$INSIGHTS" --query connectionString -o tsv)
# With the agent left on, every row would arrive twice.
if [[ "$(az containerapp env telemetry app-insights show -g "$GROUP" -n "$ENVIRONMENT" \
  --query "enableOpenTelemetryTraces || enableOpenTelemetryLogs" -o tsv 2>/dev/null)" == "true" ]]; then
  az containerapp env telemetry app-insights delete -g "$GROUP" -n "$ENVIRONMENT" --yes -o none
fi

echo "== Storage account $STORAGE for backups (private, blobs deleted after 30 days, deleted or overwritten ones kept $BACKUPS_SOFT_DELETE_DAYS)"
if ! az storage account show -g "$GROUP" -n "$STORAGE" -o none 2>/dev/null; then
  az storage account create -g "$GROUP" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
    --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false -o none
fi
if ! az storage container-rm show -g "$GROUP" --storage-account "$STORAGE" -n "$BACKUPS" -o none 2>/dev/null; then
  az storage container-rm create -g "$GROUP" --storage-account "$STORAGE" -n "$BACKUPS" --public-access off -o none
fi
# The job's identity can delete and overwrite what it writes (security review fix 6): a deleted archive comes back for
# 30 days, an overwritten one keeps its previous version. Set before the policy below, which expires those versions too.
az storage account blob-service-properties update -g "$GROUP" -n "$STORAGE" \
  --enable-delete-retention true --delete-retention-days "$BACKUPS_SOFT_DELETE_DAYS" --enable-versioning true -o none
az storage account management-policy create -g "$GROUP" --account-name "$STORAGE" -o none --policy '{
  "rules": [{ "name": "delete-after-30-days", "enabled": true, "type": "Lifecycle", "definition": {
    "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["'"$BACKUPS"'/"] },
    "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 30 } },
                 "version": { "delete": { "daysAfterCreationGreaterThan": 30 } } } } }] }'

echo "== Storage account $PHOTOS_STORAGE for photos (private, shared keys off, deleted photos recoverable for $PHOTOS_SOFT_DELETE_DAYS days)"
if ! az storage account show -g "$GROUP" -n "$PHOTOS_STORAGE" -o none 2>/dev/null; then
  az storage account create -g "$GROUP" -n "$PHOTOS_STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 --access-tier Hot \
    --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false -o none
fi
if ! az storage container-rm show -g "$GROUP" --storage-account "$PHOTOS_STORAGE" -n "$PHOTOS" -o none 2>/dev/null; then
  az storage container-rm create -g "$GROUP" --storage-account "$PHOTOS_STORAGE" -n "$PHOTOS" --public-access off -o none
fi
az storage account blob-service-properties update -g "$GROUP" -n "$PHOTOS_STORAGE" \
  --enable-delete-retention true --delete-retention-days "$PHOTOS_SOFT_DELETE_DAYS" -o none
PHOTOS_SCOPE="$(az storage account show -g "$GROUP" -n "$PHOTOS_STORAGE" --query id -o tsv)/blobServices/default/containers/$PHOTOS"

echo "== Budget $BUDGET: \$$BUDGET_AMOUNT a month on the resource group, emails at 80% actual and 100% forecast"
BUDGET_URL="https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$GROUP/providers/Microsoft.Consumption/budgets/$BUDGET?api-version=2023-05-01"
if ! az rest --method get --url "$BUDGET_URL" -o none 2>/dev/null; then
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

echo "== Delete locks on the database and both storage accounts (the only copies of the data)"
# Management-plane only: updates, the firewall rule and the lifecycle rule go through; deleting the resource (or its
# group) needs an Owner to remove the lock first. Blob deletes are the data plane, which soft delete above covers.
# A PUT, so a rerun just re-applies it.
lock() { az lock create -n "do-not-delete" --lock-type CanNotDelete --resource "$1" -o none; }
lock "$CLUSTER_ID"
lock "$(az storage account show -g "$GROUP" -n "$STORAGE" --query id -o tsv)"
lock "$(az storage account show -g "$GROUP" -n "$PHOTOS_STORAGE" --query id -o tsv)"

# Secrets go to az in a file only this user can read, removed on exit — never on a command line.
WORK=$(mktemp -d); chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT

echo "== Backup job $BACKUP_JOB: mongodump nightly into $STORAGE/$BACKUPS with its own identity (no storage key)"
STORAGE_ID=$(az storage account show -g "$GROUP" -n "$STORAGE" --query id -o tsv)
BACKUPS_SCOPE="$STORAGE_ID/blobServices/default/containers/$BACKUPS"
JOB_ENVIRONMENT_ID="$ENVIRONMENT_ID" JOB_LOCATION="$LOCATION" JOB_IMAGE="$BACKUP_IMAGE" JOB_CRON="$BACKUP_CRON" \
  JOB_SCRIPT="$(<"$(dirname "$0")/backup.sh")" JOB_BACKUP_URL="https://$STORAGE.blob.core.windows.net/$BACKUPS" \
  KING_CONN="$KING_CONN" python3 -I - >"$WORK/job.json" <<'PY'
import json, os
e = os.environ
print(json.dumps({
    "location": e["JOB_LOCATION"],
    "identity": {"type": "SystemAssigned"},
    "properties": {
        "environmentId": e["JOB_ENVIRONMENT_ID"],
        "configuration": {
            "triggerType": "Schedule",
            "scheduleTriggerConfig": {"cronExpression": e["JOB_CRON"], "parallelism": 1, "replicaCompletionCount": 1},
            "replicaTimeout": 900, "replicaRetryLimit": 1,
            "secrets": [{"name": "king-connection", "value": e["KING_CONN"]}],
        },
        "template": {"containers": [{
            "name": "backup", "image": e["JOB_IMAGE"], "command": ["bash", "-c", e["JOB_SCRIPT"]],
            "resources": {"cpu": 0.25, "memory": "0.5Gi"},
            "env": [{"name": "KING_CONN", "secretRef": "king-connection"},
                    {"name": "BACKUP_URL", "value": e["JOB_BACKUP_URL"]}],
        }]},
    },
}))
PY
if az containerapp job show -g "$GROUP" -n "$BACKUP_JOB" -o none 2>/dev/null; then
  az containerapp job update -g "$GROUP" -n "$BACKUP_JOB" --yaml "$WORK/job.json" -o none
else
  az containerapp job create -g "$GROUP" -n "$BACKUP_JOB" --yaml "$WORK/job.json" -o none
fi
grant() { # principal-id principal-type role scope
  [[ -n "$(az role assignment list --assignee "$1" --role "$3" --scope "$4" --query "[0].id" -o tsv)" ]] \
    || az role assignment create --assignee-object-id "$1" --assignee-principal-type "$2" --role "$3" --scope "$4" -o none
}
# Write access to the backups container only, for the job; read access for whoever runs the restore drill.
grant "$(az containerapp job show -g "$GROUP" -n "$BACKUP_JOB" --query identity.principalId -o tsv)" ServicePrincipal "Storage Blob Data Contributor" "$BACKUPS_SCOPE"
grant "$(az ad signed-in-user show --query id -o tsv)" User "Storage Blob Data Reader" "$BACKUPS_SCOPE"

echo "== Alert $BACKUP_ALERT: email when a backup run fails"
az monitor action-group create -g "$GROUP" -n "$ALERTS" --short-name kingofwees --action email owner "$EMAIL" -o none
if ! az monitor metrics alert show -g "$GROUP" -n "$BACKUP_ALERT" -o none 2>/dev/null; then
  az monitor metrics alert create -g "$GROUP" -n "$BACKUP_ALERT" -o none \
    --scopes "$(az containerapp job show -g "$GROUP" -n "$BACKUP_JOB" --query id -o tsv)" \
    --condition "total Executions > 0 where state includes Failed" --window-size 1h --evaluation-frequency 15m \
    --severity 2 --action "$ALERTS" --description "A nightly backup run failed: see the job's execution history and its log in $STORAGE/$BACKUPS."
fi
# A run that never happened (a disabled schedule, a stuck job) fails nothing. The Succeeded series reads 0 in hours
# with no run (checked 2026-10-25), so "fewer than one in a day" evaluates rather than waiting for data; it fires about
# a day after a missed 08:00 run and clears on the next success. Metric alerts on platform metrics cost $0.
if ! az monitor metrics alert show -g "$GROUP" -n "$BACKUP_MISSING_ALERT" -o none 2>/dev/null; then
  az monitor metrics alert create -g "$GROUP" -n "$BACKUP_MISSING_ALERT" -o none \
    --scopes "$(az containerapp job show -g "$GROUP" -n "$BACKUP_JOB" --query id -o tsv)" \
    --condition "total Executions < 1 where state includes Succeeded" --window-size 1d --evaluation-frequency 1h \
    --severity 2 --action "$ALERTS" --description "No backup run succeeded in the last day: check the job $BACKUP_JOB's schedule and execution history."
fi

# Rows can land minutes late (16 seen), so each run takes the rows that arrived since the last one, over an hour of
# event time. Stateless: a rule that stayed fired would email only once. A PUT: a rerun re-applies the rule.
log_alert() { # name, severity, query (its rows fire the alert), description
  az monitor scheduled-query create -g "$GROUP" -n "$1" -o none --scopes "$WORKSPACE_ID" \
    --condition "count 'Rows' > 0" --condition-query Rows="$3" \
    --window-size 1h --evaluation-frequency 15m --auto-mitigate false --severity "$2" --action-groups "$ALERTS_ID" --description "$4"
}
# Every API request is one unsampled AppRequests row with its real ResultCode.
request_alert() { # name, severity, filter, description
  log_alert "$1" "$2" "AppRequests | where ingestion_time() > ago(15m) | where $3" "$4"
}
echo "== Alerts $SEEN_ALERT, $PHOTO_ALERT, $ERROR_ALERT, $CAP_ALERT, $BROWSER_ALERT: email when King is seen or fed, a photo is posted, the site fails, telemetry stops or a page breaks"
ALERTS_ID=$(az monitor action-group show -g "$GROUP" -n "$ALERTS" --query id -o tsv)
WORKSPACE_ID=$(az monitor log-analytics workspace show -g "$GROUP" -n "$WORKSPACE" --query id -o tsv)
request_alert "$SEEN_ALERT" 4 "Name in ('POST /api/king/sightings', 'POST /api/king/feedings') and ResultCode == '201'" \
  "King has been seen or fed: https://$DOMAIN/history"
request_alert "$PHOTO_ALERT" 4 "Name in ('POST /api/king/events/{id}/photo', 'POST /api/king/photos') and ResultCode == '201'" \
  "A photo of King has been posted: https://$DOMAIN/photos"
# Only 5xx: every 4xx counts as a failed request too (scanners' 404s, visitors leaving a slow page's 499s).
request_alert "$ERROR_ALERT" 2 "toint(ResultCode) >= 500" \
  "The site answered with a server error: $INSIGHTS → Failures, filtered to 5xx response codes."
# Past the daily cap nothing arrives until the reset (18:00 UTC), and the three alerts above can't fire: this one says so.
# _LogOperation isn't billable and isn't capped.
log_alert "$CAP_ALERT" 2 "_LogOperation | where ingestion_time() > ago(15m) | where Category =~ 'Ingestion' | where Detail contains 'OverQuota'" \
  "Telemetry hit the workspace's daily cap: nothing arrives, and no other alert can fire, until 18:00 UTC. A flood of requests or a bug loop — $WORKSPACE → Usage, $INSIGHTS → Logs."
# What a visitor's browser reported through POST /api/client-diagnostics (one warning each, stored nowhere else).
log_alert "$BROWSER_ALERT" 3 "AppTraces | where ingestion_time() > ago(15m) | where tostring(Properties['CategoryName']) == 'KingOfWees.Server.Diagnostics.ClientDiagnostic'" \
  "A visitor's browser reported a broken page: $INSIGHTS → Logs → AppTraces, category KingOfWees.Server.Diagnostics.ClientDiagnostic."

echo "== Container app $APP"
# Re-applying the definition without the bound domains would drop them, so they're carried over.
APP_DOMAINS=$(az containerapp show -g "$GROUP" -n "$APP" --query properties.configuration.ingress.customDomains -o json 2>/dev/null || true)
APP_DOMAINS="${APP_DOMAINS:-null}" APP_ENVIRONMENT_ID="$ENVIRONMENT_ID" APP_IMAGE="$IMAGE" APP_LOCATION="$LOCATION" \
  APP_PHOTOS="Endpoint=https://$PHOTOS_STORAGE.blob.core.windows.net;ContainerName=$PHOTOS" \
  KING_CONN="$KING_CONN" INSIGHTS_CONN="$INSIGHTS_CONN" ADMIN_KEY_HASH="$ADMIN_KEY_HASH" MAP_CENTER="$MAP_CENTER" \
  python3 -I - >"$WORK/app.json" <<'PY'
import json, os
e = os.environ
secrets = [{"name": "king-connection", "value": e["KING_CONN"]},
           {"name": "insights-connection", "value": e["INSIGHTS_CONN"]}]
env = [{"name": "ConnectionStrings__king", "secretRef": "king-connection"},
       {"name": "APPLICATIONINSIGHTS_CONNECTION_STRING", "secretRef": "insights-connection"},
       # Without the agent nothing names the service. The exporter writes the role name as [kingofwees-env]/kingofwees
       # (the agent wrote kingofwees-env.kingofwees); nothing queries it.
       {"name": "OTEL_SERVICE_NAME", "value": "kingofwees"},
       {"name": "OTEL_RESOURCE_ATTRIBUTES", "value": "service.namespace=kingofwees-env"},
       # The blob address only, not a secret: the app signs in with its own identity (no storage key exists).
       {"name": "ConnectionStrings__photos", "value": e["APP_PHOTOS"]},
       {"name": "King__Proxy__TrustForwardedFor", "value": "true"}]
if e["ADMIN_KEY_HASH"]:
    secrets.append({"name": "admin-key-hash", "value": e["ADMIN_KEY_HASH"]})
    env.append({"name": "King__Admin__KeyHash", "secretRef": "admin-key-hash"})
if e["MAP_CENTER"]:
    latitude, longitude = e["MAP_CENTER"].split(",")
    secrets += [{"name": "map-center-latitude", "value": latitude}, {"name": "map-center-longitude", "value": longitude}]
    env += [{"name": "King__Map__Center__Latitude", "secretRef": "map-center-latitude"},
            {"name": "King__Map__Center__Longitude", "secretRef": "map-center-longitude"}]
ingress = {"external": True, "targetPort": 8080, "transport": "auto", "allowInsecure": False}
if json.loads(e["APP_DOMAINS"]):
    ingress["customDomains"] = json.loads(e["APP_DOMAINS"])
probe = lambda kind, path: {"type": kind, "httpGet": {"path": path, "port": 8080},
                            "periodSeconds": 10, "failureThreshold": 3, "timeoutSeconds": 5}
print(json.dumps({
    "location": e["APP_LOCATION"],
    # Its own identity, for the photos container; kept in the definition so a rerun doesn't drop it.
    "identity": {"type": "SystemAssigned"},
    "properties": {
        "managedEnvironmentId": e["APP_ENVIRONMENT_ID"],
        "configuration": {
            "activeRevisionsMode": "Single",
            # One replica only: the rate limits live in memory, so a second replica would double them.
            "ingress": ingress,
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
else
  az containerapp create -g "$GROUP" -n "$APP" --yaml "$WORK/app.json" -o none
fi
# The identity comes from the definition (checked on the first real run, 2026-10-12). Don't add
# `az containerapp identity assign`: on an app that already has one it re-sends the app with the identity's principalId,
# which Azure refuses (InvalidResourceIdentityPrincipalId). The identity reads and writes photos, in that container only.
grant "$(az containerapp show -g "$GROUP" -n "$APP" --query identity.principalId -o tsv)" ServicePrincipal "Storage Blob Data Contributor" "$PHOTOS_SCOPE"
if [[ -n "$EXISTING_IMAGE" ]]; then
  # A secret change alone doesn't reach a running revision. After the grant, so the restarted app can reach its photos
  # (a new role assignment can still take a few minutes to apply).
  az containerapp revision restart -g "$GROUP" -n "$APP" \
    --revision "$(az containerapp show -g "$GROUP" -n "$APP" --query properties.latestRevisionName -o tsv)" -o none
fi

echo "== Alerts $RESTART_ALERT and $MEMORY_ALERT: the app restarted, or memory is near its limit (platform metrics, \$0)"
# RestartCount counts a replica's restarts since it started, so the first restart fires the rule and it stays fired
# until the next deploy (one email, which is the point); a second restart in between sends nothing more.
# Memory: 243–272 MiB of 512 over two quiet days, 310–335 MiB under uploads (Slice 6); 450 MiB says a leak, not a day's work.
APP_ID=$(az containerapp show -g "$GROUP" -n "$APP" --query id -o tsv)
app_alert() { # name, severity, condition, window, description — created once; change one with `az monitor metrics alert update`
  az monitor metrics alert show -g "$GROUP" -n "$1" -o none 2>/dev/null \
    || az monitor metrics alert create -g "$GROUP" -n "$1" -o none --scopes "$APP_ID" --condition "$3" --window-size "$4" \
         --evaluation-frequency 15m --severity "$2" --action "$ALERTS" --description "$5"
}
app_alert "$RESTART_ALERT" 2 "max RestartCount > 0" 1h "The app restarted (a crash, or out of memory): $APP → Revisions and replicas, then $INSIGHTS → Failures around that time."
app_alert "$MEMORY_ALERT" 2 "avg WorkingSetBytes > 471859200" 15m "The app is using more than 450 MiB of its 512: $APP → Metrics (Memory Working Set Bytes). Quiet days sit at ~250 MiB."

echo "== Custom domains $DOMAIN and www.$DOMAIN (free managed certificates)"
# Both need their records first (A @ → environment IP or CNAME www → app address, plus TXT asuid.<host>), DNS only:
# the certificate is issued and renewed only while DigiCert reaches the app directly.
APP_FQDN=$(az containerapp show -g "$GROUP" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
VERIFICATION=$(az containerapp show -g "$GROUP" -n "$APP" --query properties.customDomainVerificationId -o tsv)
bind_domain() { # host record-type expected-value validation-method
  local listed
  listed=$(az containerapp hostname list -g "$GROUP" -n "$APP" --query "[?name=='$1'].bindingType" -o tsv)
  if [[ "$listed" == "SniEnabled" ]]; then echo "$1: bound"; return; fi
  if [[ "$(dig +short "$1" "$2" | head -1)" != "$3" || "$(dig +short "asuid.$1" TXT)" != "\"$VERIFICATION\"" ]]; then
    echo "$1: skipped, its DNS records aren't there yet ($2 → $3, TXT asuid.$1)"; return
  fi
  [[ -n "$listed" ]] || az containerapp hostname add -g "$GROUP" -n "$APP" --hostname "$1" -o none
  az containerapp hostname bind -g "$GROUP" -n "$APP" --hostname "$1" --environment "$ENVIRONMENT" --validation-method "$4" -o none
  echo "$1: bound"
}
bind_domain "$DOMAIN" A "$(az containerapp env show -g "$GROUP" -n "$ENVIRONMENT" --query properties.staticIp -o tsv)" HTTP
bind_domain "www.$DOMAIN" CNAME "$APP_FQDN." CNAME

echo "== Availability test $UP_TEST: GET https://$DOMAIN/health from two places every 15 minutes; $DOWN_ALERT emails when both fail"
# Every alert above fires on rows the app sends; this one needs none. Standard web tests cost \$0.0005 a run (2026-10-25):
# two locations every 900 s is \$2.88 a month (300 s would be \$8.64). /health (the database included) isn't traced or
# rate-limited, so the probes add no request rows; their results land in AppAvailabilityResults (~0.2 MB a day). The
# certificate's remaining life is checked too: 14 days before it expires the test fails, in time for a renewal that didn't happen.
INSIGHTS_ID=$(az monitor app-insights component show -g "$GROUP" --app "$INSIGHTS" --query id -o tsv)
az monitor app-insights web-test create -g "$GROUP" -n "$UP_TEST" -l "$LOCATION" --defined-web-test-name "$UP_TEST" \
  --web-test-kind standard --request-url "https://$DOMAIN/health" --http-verb GET --expected-status-code 200 \
  --frequency 900 --timeout 30 --retry-enabled true --enabled true --ssl-check true --ssl-lifetime-check 14 \
  --locations Id="us-va-ash-azr" --locations Id="us-il-ch1-azr" \
  --tags "hidden-link:$INSIGHTS_ID=Resource" -o none
WEBTEST_ID=$(az monitor app-insights web-test show -g "$GROUP" -n "$UP_TEST" --query id -o tsv)
# The CLI's --condition grammar has no web-test criteria, so the rule goes in as the portal writes it. Both locations
# over 30 minutes (each runs twice in that window): one probe's hiccup isn't an outage. A PUT: a rerun re-applies it.
az rest --method put -o none \
  --url "https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$GROUP/providers/Microsoft.Insights/metricAlerts/$DOWN_ALERT?api-version=2018-03-01" \
  --body '{ "location": "global",
    "tags": { "hidden-link:'"$INSIGHTS_ID"'": "Resource", "hidden-link:'"$WEBTEST_ID"'": "Resource" },
    "properties": { "description": "kingofwees.com is not answering from outside (or its certificate is about to expire): '"$INSIGHTS"' → Availability.",
      "severity": 1, "enabled": true, "scopes": ["'"$WEBTEST_ID"'", "'"$INSIGHTS_ID"'"],
      "evaluationFrequency": "PT5M", "windowSize": "PT30M", "autoMitigate": true,
      "criteria": { "odata.type": "Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria",
                    "webTestId": "'"$WEBTEST_ID"'", "componentId": "'"$INSIGHTS_ID"'", "failedLocationCount": 2 },
      "actions": [{ "actionGroupId": "'"$ALERTS_ID"'" }] } }'

echo "== Workbook \"King of Wees\" ($INSIGHTS → Workbooks): Health now, Triage, Usage"
# The template (infra/azure/workbook.json) queries the workspace and charts the app's platform metrics; the resource ids
# are filled in here. Listed under the Application Insights resource (--source-id). A rerun re-applies it.
sed "s#__WORKSPACE_ID__#$WORKSPACE_ID#g; s#__APP_ID__#$APP_ID#g" "$(dirname "$0")/workbook.json" >"$WORK/workbook.json"
if az monitor app-insights workbook show -g "$GROUP" -n "$WORKBOOK" -o none 2>/dev/null; then
  az monitor app-insights workbook update -g "$GROUP" -n "$WORKBOOK" --serialized-data "$(<"$WORK/workbook.json")" -o none
else
  az monitor app-insights workbook create -g "$GROUP" -n "$WORKBOOK" -l "$LOCATION" --kind shared --category workbook \
    --display-name "King of Wees" --source-id "$INSIGHTS_ID" --serialized-data "$(<"$WORK/workbook.json")" -o none
fi

echo "== Done: https://$(az containerapp show -g "$GROUP" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv) ($IMAGE)"
