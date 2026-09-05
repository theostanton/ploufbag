#!/usr/bin/env bash
#
# Apply the database schema, in the order manifest.txt gives.
#
# Runs on every deploy, before the new code goes live. It exists because the
# schema used to be applied by hand: create_activities.sql shipped in #34 and
# was never run against production, so from that merge onwards every Strava
# upload died on `Activities.upsertScanned` before it could create a flight, and
# the only trace was a webhook_events row nobody was looking at.
#
# Two properties make it safe to run unattended on merge to main:
#
#   * Every script in the manifest is additive and guarded, so re-applying one
#     is a no-op. Anything that drops or truncates is refused outright unless it
#     says `-- migrate: destructive-ok`, which mirrors the destroy guard the
#     Terraform step already has.
#   * What ran is recorded in schema_migrations, so "did the migration go on?"
#     is a query rather than an inference from behaviour.
#
# Usage:
#   scripts/migrate.sh          # apply anything not yet recorded
#   scripts/migrate.sh --check  # report what is missing, change nothing
#
# Connection comes from the environment, the same DATABASE_* variables the
# services use:
#
#   DATABASE_HOST DATABASE_PORT DATABASE_NAME DATABASE_USER DATABASE_PASSWORD
#
# Against Cloud SQL that means pointing it at a cloud-sql-proxy on localhost;
# see .github/workflows/deploy.yml.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/functions/src/model/database/scripts"
MANIFEST="$SCRIPTS_DIR/manifest.txt"

CHECK_ONLY=false
if [ "${1:-}" = "--check" ]; then
    CHECK_ONLY=true
fi

for required in DATABASE_HOST DATABASE_NAME DATABASE_USER; do
    if [ -z "${!required:-}" ]; then
        echo "migrate: $required is not set" >&2
        exit 2
    fi
done

export PGHOST="$DATABASE_HOST"
export PGPORT="${DATABASE_PORT:-5432}"
export PGDATABASE="$DATABASE_NAME"
export PGUSER="$DATABASE_USER"
export PGPASSWORD="${DATABASE_PASSWORD:-}"

psql_quiet() {
    # ON_ERROR_STOP so a broken statement fails here rather than leaving a
    # half-applied schema to fail later, somewhere much less legible.
    psql -v ON_ERROR_STOP=1 -qtAX "$@"
}

# Statements that lose data. Deliberately narrow: dropping an index or a
# constraint is ordinary migration work, dropping a table is not.
DESTRUCTIVE='^[[:space:]]*(drop[[:space:]]+(table|view|type|column|schema|database)|truncate|delete[[:space:]]+from)'

manifest_entries() {
    sed 's/#.*//' "$MANIFEST" | awk 'NF { print $1 }'
}

# The schema files use `;;;` as a statement separator, because several contain
# plpgsql bodies full of ordinary semicolons.
split_statements() {
    python3 - "$1" "$2" <<'PY'
import pathlib, sys
source, out_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
chunks = [c.strip() for c in source.read_text().split(";;;")]
for index, chunk in enumerate([c for c in chunks if c]):
    (out_dir / f"{index:03d}.sql").write_text(chunk + "\n")
PY
}

ensure_ledger() {
    psql_quiet -c "
        set client_min_messages = warning;
        create table if not exists schema_migrations (
            filename   text primary key,
            checksum   text                     not null,
            applied_at timestamp with time zone not null default now()
        )" >/dev/null
}

echo "==> ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"

missing=()
while read -r name; do
    path="$SCRIPTS_DIR/$name.sql"
    if [ ! -f "$path" ]; then
        echo "migrate: $name is in the manifest but $path does not exist" >&2
        exit 1
    fi
    if grep -qiE '^--[[:space:]]*migrate:[[:space:]]*destructive-ok' "$path"; then
        continue
    fi
    if grep -qiE "$DESTRUCTIVE" "$path"; then
        echo "migrate: $name.sql drops or truncates, and deploys run unattended." >&2
        echo "         Take it out of the manifest, or mark it with:" >&2
        echo "         -- migrate: destructive-ok" >&2
        exit 1
    fi
done < <(manifest_entries)

if [ "$CHECK_ONLY" = true ]; then
    # --check has to work against a database that has never had the ledger, so
    # it asks for the table rather than assuming it.
    has_ledger="$(psql_quiet -c "select to_regclass('public.schema_migrations') is not null")"
else
    ensure_ledger
    has_ledger=t
fi

applied=0
skipped=0
while read -r name; do
    path="$SCRIPTS_DIR/$name.sql"
    checksum="$(sha256sum "$path" | cut -d' ' -f1)"

    if [ "$has_ledger" = "t" ]; then
        recorded="$(psql_quiet -c "select checksum from schema_migrations where filename = '$name'")"
    else
        recorded=""
    fi

    if [ "$recorded" = "$checksum" ]; then
        skipped=$((skipped + 1))
        continue
    fi

    if [ "$CHECK_ONLY" = true ]; then
        missing+=("$name")
        continue
    fi

    echo "    apply   $name"
    tmp="$(mktemp -d)"
    split_statements "$path" "$tmp"

    for statement in "$tmp"/*.sql; do
        if ! error="$(psql_quiet -f "$statement" 2>&1)"; then
            # The first run against a database built by hand finds everything
            # already there, and that is the expected case rather than a
            # failure. Anything else is real and stops the deploy.
            if grep -qiE 'already exists|duplicate key|duplicate object' <<<"$error"; then
                continue
            fi
            echo "    FAILED  $name ($(basename "$statement"))" >&2
            sed 's/^/            /' <<<"$error" >&2
            rm -rf "$tmp"
            exit 1
        fi
    done
    rm -rf "$tmp"

    psql_quiet -c "
        insert into schema_migrations (filename, checksum)
        values ('$name', '$checksum')
        on conflict (filename)
            do update set checksum = excluded.checksum, applied_at = now()" >/dev/null
    applied=$((applied + 1))
done < <(manifest_entries)

if [ "$CHECK_ONLY" = true ]; then
    if [ ${#missing[@]} -eq 0 ]; then
        echo "==> schema is up to date"
        exit 0
    fi
    echo "==> ${#missing[@]} not applied:" >&2
    printf '    %s\n' "${missing[@]}" >&2
    exit 1
fi

echo "==> applied $applied, already current $skipped"
