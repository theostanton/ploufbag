#!/usr/bin/env bash
#
# Local Postgres for site development, without Docker.
#
# `task local-build && docker compose up` is the documented way to run this
# stack, and it remains the way to validate it. This script exists for
# environments with no Docker daemon -- CI sandboxes, remote agent containers --
# where the site still needs a real database to render against.
#
# It is deliberately not a second source of truth for the schema: it applies the
# same files from functions/src/model/database/scripts that
# generateContainer.test.ts applies, in the same `;;;`-delimited way.
#
# Usage:
#   dev/db.sh up       # initdb if needed, start, apply schema, seed
#   dev/db.sh down     # stop the cluster
#   dev/db.sh reset    # destroy the data directory and start over
#   dev/db.sh psql     # interactive shell against the dev database
#   dev/db.sh status   # is it running?
#   dev/db.sh env      # print the DATABASE_* exports the site needs

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
# Outside the repo by default: the data directory is throwaway state, and a
# stray `git add -A` should not be able to reach it.
DEV_ROOT="${PLOUFBAG_DEV_ROOT:-${TMPDIR:-/tmp}/ploufbag-dev}"
PGDATA="$DEV_ROOT/pgdata"
PGLOG="$DEV_ROOT/postgres.log"
PGPORT="${PLOUFBAG_DEV_PGPORT:-5433}"
PGUSER_NAME="ploufbag"
PGDB="ploufbag"

# The postgres binaries refuse to run as root. In a container we usually are
# root, so drop to the postgres account that ships with the server package; when
# already unprivileged, run in place.
if [ "$(id -u)" = "0" ]; then
    RUN_AS="postgres"
else
    RUN_AS=""
fi

as_pg() {
    if [ -n "$RUN_AS" ]; then
        su "$RUN_AS" -s /bin/bash -c "$1"
    else
        bash -c "$1"
    fi
}

psql_cmd() {
    # -v ON_ERROR_STOP=1 so a broken statement fails the script rather than
    # leaving a half-applied schema that fails much later and less legibly.
    as_pg "$PGBIN/psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $PGPORT -U $PGUSER_NAME -d $PGDB $*"
}

is_running() {
    as_pg "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1
}

ensure_dirs() {
    mkdir -p "$DEV_ROOT"
    if [ -n "$RUN_AS" ]; then
        chown "$RUN_AS" "$DEV_ROOT"
    fi
}

do_init() {
    if [ -f "$PGDATA/PG_VERSION" ]; then
        return
    fi
    echo "==> initdb $PGDATA"
    ensure_dirs
    # trust auth: this cluster listens on loopback only and holds nothing but
    # generated fixtures.
    as_pg "$PGBIN/initdb -D $PGDATA -U $PGUSER_NAME --auth=trust --encoding=UTF8 --no-sync" >/dev/null
}

do_start() {
    if is_running; then
        echo "==> already running on port $PGPORT"
        return
    fi
    echo "==> starting postgres on port $PGPORT"
    ensure_dirs
    as_pg "$PGBIN/pg_ctl -D $PGDATA -l $PGLOG -o '-p $PGPORT -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off' -w start"
    if ! as_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U $PGUSER_NAME -lqt" | cut -d'|' -f1 | grep -qw "$PGDB"; then
        as_pg "$PGBIN/createdb -h 127.0.0.1 -p $PGPORT -U $PGUSER_NAME $PGDB"
    fi
}

# The schema files use `;;;` as a statement separator, because several of them
# contain plpgsql bodies full of ordinary semicolons.
#
# The order itself lives in the scripts directory's manifest.txt, which is the
# same list the deploy applies and the test suites load. It used to be repeated
# here, and the repetition is exactly how a developer's laptop came to have
# tables production did not: four copies of one order, and adding a table meant
# remembering all four.
mapfile -t SCHEMA_FILES < <(
    sed 's/#.*//' "$REPO_ROOT/functions/src/model/database/scripts/manifest.txt" |
        awk 'NF { print $1 }'
)

# Applied after the fixtures, not with the schema.
#
# backfill_wings turns the free text in flights.wing into rows in wings, so it
# has nothing to work with until the seed has inserted some flights. Running it
# here mirrors production, where the schema goes on first and the backfill runs
# over six years of existing rows.
BACKFILL_FILES=(
    backfill_wings
)

# $@ - script basenames, applied in the order given.
apply_scripts() {
    local scripts="$REPO_ROOT/functions/src/model/database/scripts"
    local tmp
    tmp="$(mktemp -d "$DEV_ROOT/schema.XXXXXX")"
    if [ -n "$RUN_AS" ]; then
        chmod 755 "$tmp"
    fi

    # The chunk files are applied by globbing $tmp, which sorts lexically, so
    # each script's position in the argument list has to be baked into the
    # filename. Without it add_created_at_to_pilots sorts ahead of create_pilots
    # and the migration runs against a table that does not exist yet.
    local order=0
    for name in "$@"; do
        # Split on ;;; into one file per statement. Files that use plain
        # semicolons only come through as a single chunk, which psql runs fine.
        node -e '
            const fs = require("fs");
            const [src, outDir, prefix] = process.argv.slice(1);
            const chunks = fs.readFileSync(src, "utf8").split(";;;")
                .map(s => s.trim()).filter(Boolean);
            chunks.forEach((chunk, i) => {
                const n = String(i).padStart(3, "0");
                fs.writeFileSync(`${outDir}/${prefix}.${n}.sql`, chunk + "\n");
            });
        ' "$scripts/$name.sql" "$tmp" "$(printf '%02d-%s' "$order" "$name")"
        order=$((order + 1))
    done

    if [ -n "$RUN_AS" ]; then
        chmod 644 "$tmp"/*.sql
    fi

    # A re-applied create_* collides on objects that already exist, which is the
    # normal case on a second `up`. Anything else is a real failure and has to be
    # visible -- swallowing it leaves a half-built schema that fails much later,
    # somewhere much less obvious.
    for file in "$tmp"/*.sql; do
        local err
        if ! err="$(psql_cmd "-q -f $file" 2>&1)"; then
            if grep -qiE 'already exists|duplicate key' <<<"$err"; then
                echo "    exists  $(basename "$file")"
            else
                echo "    FAILED  $(basename "$file")" >&2
                sed 's/^/            /' <<<"$err" >&2
                exit 1
            fi
        fi
    done

    rm -rf "$tmp"
}

do_schema() {
    echo "==> applying schema"
    apply_scripts "${SCHEMA_FILES[@]}"
}

do_backfill() {
    echo "==> backfilling"
    apply_scripts "${BACKFILL_FILES[@]}"
}

do_seed() {
    echo "==> seeding fixtures"
    local sql="$DEV_ROOT/seed.sql"
    node "$REPO_ROOT/dev/seed.mjs" > "$sql"
    if [ -n "$RUN_AS" ]; then
        chmod 644 "$sql"
    fi
    psql_cmd "-q -f $sql" >/dev/null
    psql_cmd "-c 'select
        (select count(*) from pilots) as pilots,
        (select count(*) from sites) as sites,
        (select count(*) from flights) as flights'"
}

do_env() {
    cat <<EOF
DATABASE_HOST=127.0.0.1
DATABASE_PORT=$PGPORT
DATABASE_NAME=$PGDB
DATABASE_USER=$PGUSER_NAME
DATABASE_PASSWORD=
EOF
}

case "${1:-up}" in
    up)
        do_init
        do_start
        do_schema
        do_seed
        do_backfill
        echo
        echo "==> ready. Point the site at it with:"
        do_env | sed 's/^/    /'
        ;;
    down)
        if is_running; then
            as_pg "$PGBIN/pg_ctl -D $PGDATA -m fast -w stop"
        else
            echo "==> not running"
        fi
        ;;
    reset)
        if is_running; then
            as_pg "$PGBIN/pg_ctl -D $PGDATA -m immediate -w stop" || true
        fi
        rm -rf "$PGDATA"
        "$0" up
        ;;
    psql)
        shift
        as_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U $PGUSER_NAME -d $PGDB $*"
        ;;
    status)
        if is_running; then echo "running on port $PGPORT"; else echo "stopped"; fi
        ;;
    env)
        do_env
        ;;
    *)
        echo "usage: $0 {up|down|reset|psql|status|env}" >&2
        exit 1
        ;;
esac
