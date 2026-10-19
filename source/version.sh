#!/usr/bin/env bash
# Prints this checkout's version: the commit's date in UTC as year.month.day (no leading zeros) + its 12-character id,
# e.g. 2026.10.18+f349dc1e5d2a, with ".dirty" added while files are uncommitted. The only place the version is worked
# out — the server build, the frontend build and infra/deploy.sh all run it. Why this shape → docs/patterns/versioning.md.
set -euo pipefail
cd "$(dirname "$0")"

read -r YEAR MONTH DAY < <(TZ=UTC git log -1 --date=format-local:'%Y %m %d' --format=%cd)
VERSION="$YEAR.$((10#$MONTH)).$((10#$DAY))+$(git rev-parse --short=12 HEAD)"
[[ -z "$(git status --porcelain)" ]] || VERSION+=".dirty"
echo "$VERSION"
