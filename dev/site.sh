#!/usr/bin/env bash
#
# Runs the Next.js site against the local development database from dev/db.sh.
#
# Reads dev/.env.local if present -- that file holds the Mapbox token and is
# gitignored. Everything else is derived from dev/db.sh, so there is one place
# that knows the port.
#
#   dev/site.sh          # start the dev server in the foreground
#   dev/site.sh build    # production build against the same env

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC2046
export $(./dev/db.sh env | xargs -d '\n')

if [ -f dev/.env.local ]; then
    set -a
    # shellcheck disable=SC1091
    source dev/.env.local
    set +a
fi

# The site's own auth path needs this; any value works locally because nothing
# here issues a real Strava session.
export SESSION_SECRET="${SESSION_SECRET:-dev-session-secret-not-for-any-real-use}"

if [ -z "${NEXT_PUBLIC_MAPBOX_TOKEN:-}" ]; then
    echo "WARNING: NEXT_PUBLIC_MAPBOX_TOKEN is not set." >&2
    echo "         The chrome will render but the map will be blank." >&2
    echo "         Put it in dev/.env.local (see dev/env.example)." >&2
    echo >&2
fi

# Some sandboxes allow outbound HTTPS from Node but not from the browser, so
# Mapbox tiles fail with a connection reset and the map renders blank. Setting
# both halves of the flag routes them through the dev server instead. See
# site/src/app/api/dev/mapbox/route.ts; harmless when the browser can reach
# Mapbox directly.
if [ "${PLOUFBAG_DEV_MAP_PROXY:-1}" = "1" ]; then
    export PLOUFBAG_DEV_MAP_PROXY=1
    export NEXT_PUBLIC_DEV_MAP_PROXY=1
fi

if ! ./dev/db.sh status | grep -q running; then
    echo "==> database is not running; starting it"
    ./dev/db.sh up >/dev/null
fi

cd site
case "${1:-dev}" in
    dev)   exec yarn next dev --port "${SITE_PORT:-3000}" ;;
    build) exec yarn next build ;;
    *)     echo "usage: $0 {dev|build}" >&2; exit 1 ;;
esac
