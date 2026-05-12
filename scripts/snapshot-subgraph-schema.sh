#!/usr/bin/env bash
# Compare bundled schema-snapshot.graphql against current upstream v3-subgraph schema.
# Prints diff to stdout; exits 0 if identical, 1 if drift detected.
# Used by the daily GitHub Action to open a `schema-drift` issue when needed.
#
# Usage:
#   bash scripts/snapshot-subgraph-schema.sh             # diff only
#   bash scripts/snapshot-subgraph-schema.sh --update    # overwrite local snapshot with upstream (manual sync)

set -euo pipefail

UPSTREAM_URL="https://raw.githubusercontent.com/stakewise/v3-subgraph/main/src/schema.graphql"
LOCAL="data-skill/references/schema-snapshot.graphql"

mode="diff"
if [[ "${1:-}" == "--update" ]]; then
  mode="update"
fi

if [[ ! -f "$LOCAL" ]]; then
  echo "::error::Local snapshot not found at $LOCAL"
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

curl -fsSL --max-time 30 "$UPSTREAM_URL" -o "$tmp"

# Strip our header lines (`#` prefix at the top of the bundled file) before diffing
# so cosmetic header differences don't trigger drift.
strip_header() {
  awk '/^#/ && header_done == 0 { next } { header_done = 1; print }' "$1"
}

if diff -q <(strip_header "$LOCAL") <(strip_header "$tmp") >/dev/null 2>&1; then
  echo "schema in sync — no drift."
  exit 0
fi

echo "schema drift detected. Diff (local vs upstream):"
echo ""
diff -u <(strip_header "$LOCAL") <(strip_header "$tmp") || true

if [[ "$mode" == "update" ]]; then
  upstream_sha="$(curl -fsSL --max-time 30 https://api.github.com/repos/stakewise/v3-subgraph/commits/main | jq -r '.sha')"
  upstream_date="$(date -u +%Y-%m-%d)"

  echo ""
  echo "Updating local snapshot to upstream@${upstream_sha} (${upstream_date})…"

  {
    echo "# Snapshot of stakewise/v3-subgraph@${upstream_sha} on ${upstream_date}"
    echo "# Source: https://github.com/stakewise/v3-subgraph/blob/${upstream_sha}/src/schema.graphql"
    echo "# DO NOT EDIT — automatically synced by scripts/snapshot-subgraph-schema.sh"
    cat "$tmp"
  } > "$LOCAL"

  echo "wrote $LOCAL"
  echo ""
  echo "Don't forget to:"
  echo "  1. Update data-skill/.claude-plugin/plugin.json metadata.subgraphSchemaCommit to '${upstream_sha}'"
  echo "  2. Update metadata.subgraphSchemaDate to '${upstream_date}'"
  echo "  3. Review references/entities.md and references/cookbook.md for any breaking changes"
  echo "  4. Bump data-skill plugin version (minor for added fields, major for breaking)"
fi

exit 1
