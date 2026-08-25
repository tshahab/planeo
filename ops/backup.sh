#!/bin/sh
set -eu

backup_dir=${1:?usage: ops/backup.sh BACKUP_DIRECTORY}
mkdir -p "$backup_dir"
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose -f compose.staging.yaml exec -T database pg_dump -U planeo -d planeo --format=custom > "$backup_dir/database.dump"
docker compose -f compose.staging.yaml exec -T app tar -C /app/storage -czf - . > "$backup_dir/attachments.tgz"
completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'started_at=%s\ncompleted_at=%s\n' "$started_at" "$completed_at" > "$backup_dir/manifest.txt"
printf 'backup written to %s\n' "$backup_dir"
