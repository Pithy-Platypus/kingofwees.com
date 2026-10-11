#!/usr/bin/env bash
# Checks a running site from the outside. Usage: infra/smoke.sh https://kingofwees.com
set -uo pipefail

BASE=${1:?usage: infra/smoke.sh https://host}
[[ "$BASE" == https://* ]] || { echo "Smoke-test over HTTPS only." >&2; exit 2; }
FAILED=0

expect() { # expect <status> <path> [body]
  local response status body
  response=$(curl -sS --max-time 15 -w $'\n%{http_code}' "$BASE$2") || { echo "FAIL $2: no HTTPS answer (certificate?)"; FAILED=1; return; }
  status=${response##*$'\n'}; body=${response%$'\n'*}
  if [[ "$status" != "$1" || ( -n "${3:-}" && "$body" != "$3" ) ]]; then
    echo "FAIL $2: got $status, expected $1${3:+ \"$3\"}"; FAILED=1
  else
    echo "ok   $2 $status"
  fi
}

expect 200 /health Healthy        # the database is reachable (the SPA would answer 200 with HTML)
expect 200 /api/king/status
expect 401 /api/admin/check       # 404 here means no admin key hash is set
exit $FAILED
