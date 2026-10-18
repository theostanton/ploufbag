#!/usr/bin/env bash
#
# Run by Cyrus in every new git worktree it creates for a Linear issue, before
# the agent starts. The worktree is a fresh checkout with no node_modules, so
# without this every session spends its first minutes installing, and the site
# cannot import @ploufbag/common until common is built.
#
# Cyrus provides LINEAR_ISSUE_IDENTIFIER, LINEAR_ISSUE_ID and LINEAR_ISSUE_TITLE.
# It enforces a 5-minute timeout and carries on if this fails, so failures are
# reported loudly rather than silently half-installing.
#
# Safe to run by hand: ./cyrus-setup.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

echo "==> ploufbag setup for ${LINEAR_ISSUE_IDENTIFIER:-a manual run}"

# The repo uses Yarn 1 lockfiles. The Mac mini's agent user has no global yarn,
# and corepack cannot enable shims inside a Homebrew-owned node prefix.
if command -v yarn >/dev/null 2>&1; then
    YARN=(yarn)
else
    YARN=(npx --yes yarn@1.22.22)
fi

# site and functions depend on common via file:../common, which Yarn 1 *copies*
# at install time -- so common must be built before they install, or they get a
# copy with no dist/ and fail with "Can't resolve '@ploufbag/common'". Same
# order as .github/workflows/ci.yml.
echo "==> yarn install + build (common)"
(cd common && "${YARN[@]}" install --frozen-lockfile --non-interactive --silent && "${YARN[@]}" build)

# --check-files: on a re-run Yarn would otherwise keep its stale copy of common
# and skip the install as "up to date".
for package in functions site; do
    echo "==> yarn install ($package)"
    (cd "$package" && "${YARN[@]}" install --frozen-lockfile --check-files --non-interactive --silent)
done

# The dev harness reads the Mapbox token from dev/.env.local, which is
# gitignored and therefore missing from every fresh worktree. Keep the real one
# outside the repo and copy it in.
DEV_ENV_SOURCE="${PLOUFBAG_DEV_ENV:-$HOME/.cyrus/ploufbag/dev.env.local}"
if [ -f "$DEV_ENV_SOURCE" ]; then
    cp "$DEV_ENV_SOURCE" dev/.env.local
    echo "==> copied dev/.env.local from $DEV_ENV_SOURCE"
fi

echo "==> setup complete"
