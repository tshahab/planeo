#!/bin/sh
set -eu

backup_dir=${1:?usage: ops/restore-verify.sh BACKUP_DIRECTORY}
test -s "$backup_dir/database.dump"
test -s "$backup_dir/attachments.tgz"
test -s "$backup_dir/manifest.txt"
completed_at=$(sed -n 's/^completed_at=//p' "$backup_dir/manifest.txt")
test -n "$completed_at"
started=$(date +%s)
BACKUP_DIRECTORY="$backup_dir" docker compose -f compose.recovery.yaml down --volumes >/dev/null 2>&1 || true
BACKUP_DIRECTORY="$backup_dir" docker compose -f compose.recovery.yaml run --rm restore
BACKUP_DIRECTORY="$backup_dir" docker compose -f compose.recovery.yaml run --rm verify-attachments
BACKUP_DIRECTORY="$backup_dir" docker compose -f compose.recovery.yaml down --volumes
finished=$(date +%s)
printf 'drill_at=%s\nrpo_source=%s\nrto_seconds=%s\nresult=passed\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$completed_at" "$((finished-started))" > "$backup_dir/restore-result.txt"
cat "$backup_dir/restore-result.txt"
