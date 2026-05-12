#!/usr/bin/env bash
# Verify the cookbook's core queries still work against every production subgraph.
# Non-blocking: exit code is informational only when run via the daily GitHub
# Action; locally the script returns 1 if any probe failed so you can iterate.
#
# Usage:
#   bash scripts/verify-queries.sh                      # all networks, fail if any breaks
#   NETWORK=mainnet bash scripts/verify-queries.sh      # one network
#   QUIET=1 bash scripts/verify-queries.sh              # only print failures

set -u
set -o pipefail

NETWORKS_DEFAULT=("mainnet" "gnosis" "hoodi")
if [[ -n "${NETWORK:-}" ]]; then
  NETWORKS=("$NETWORK")
else
  NETWORKS=("${NETWORKS_DEFAULT[@]}")
fi

QUIET="${QUIET:-0}"
fail_count=0
pass_count=0
failures=()

subgraph_url() {
  echo "https://graphs.stakewise.io/$1/subgraphs/name/stakewise/prod"
}

# Each probe runs a small GraphQL query and asserts `data.{topKey}` exists and
# `errors` is absent. We deliberately use the minimum fields to keep the response
# small; the assertion is on the response shape, not on specific values.
probe() {
  local label="$1"
  local network="$2"
  local query="$3"
  local top_key="$4"

  local url
  url="$(subgraph_url "$network")"

  local body
  body=$(printf '{"query":%s}' "$(jq -Rs . <<<"$query")")

  local response
  response="$(curl -fsSL -m 30 -X POST -H 'content-type: application/json' --data "$body" "$url" 2>/dev/null)" || {
    fail_count=$((fail_count + 1))
    failures+=("[$network] $label — curl failed (network / 5xx)")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [$network] $label — curl failed"
    return
  }

  if echo "$response" | jq -e '.errors' >/dev/null 2>&1; then
    fail_count=$((fail_count + 1))
    failures+=("[$network] $label — GraphQL errors: $(echo "$response" | jq -c '.errors')")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [$network] $label — GraphQL errors"
    return
  fi

  if ! echo "$response" | jq -e ".data.$top_key" >/dev/null 2>&1; then
    fail_count=$((fail_count + 1))
    failures+=("[$network] $label — missing data.$top_key in response")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [$network] $label — missing data.$top_key"
    return
  fi

  pass_count=$((pass_count + 1))
  [[ "$QUIET" == "1" ]] || echo "  ok   [$network] $label"
}

for network in "${NETWORKS[@]}"; do
  [[ "$QUIET" == "1" ]] || echo "=== $network ==="

  # Recipe 1 + 13 — vault data (full field set incl. score)
  probe "vault list (top by TVL) — recipe 15" "$network" \
    '{ vaults(first:3, orderBy: totalAssets, orderDirection: desc) { id displayName apy baseApy extraApy allocatorMaxBoostApy feePercent totalAssets capacity score isPrivate isBlocklist isErc20 isOsTokenEnabled isMetaVault isCollateralized canHarvest mevEscrow admin feeRecipient osTokenConfig { ltvPercent liqThresholdPercent } } }' \
    "vaults"

  # Recipe 7 — network stats. `collateralizedVaultsCount` exists in source schema
  # but is not yet deployed to prod subgraph (as of 2026-05-12) — keep it out.
  probe "network stats — recipe 7" "$network" \
    '{ networks(first:1) { usersCount vaultsCount totalAssets totalEarnedAssets } }' \
    "networks"

  # Recipe 8 — exchange rates
  probe "exchange rates — recipe 8" "$network" \
    '{ exchangeRates(first:1) { osTokenAssetsRate assetsUsdRate swiseUsdRate } }' \
    "exchangeRates"

  # Indexing lag
  probe "checkpoint (indexing lag)" "$network" \
    '{ checkpoints(first:1, orderBy: timestamp, orderDirection: desc) { timestamp } }' \
    "checkpoints"

  # osToken global
  probe "osToken global" "$network" \
    '{ osTokens(first:1) { apy feePercent } }' \
    "osTokens"

  # Recipe optional A — active campaigns
  probe "periodic distributions (active) — follow-up A" "$network" \
    '{ periodicDistributions(first:5, where:{ endTimestamp_gt: "1000000000" }) { distributionType apy startTimestamp endTimestamp } }' \
    "periodicDistributions"

  # Recipe 6 — vault history shape (also covers recipe E)
  probe "vault snapshot (history shape) — recipe 6" "$network" \
    '{ vaultSnapshots(first:1, orderBy: timestamp, orderDirection: desc) { timestamp apy totalAssets earnedAssets } }' \
    "vaultSnapshots"

  # Recipe 12 — action history shape + enum existence
  probe "allocator actions + enum — recipe 12" "$network" \
    '{ allocatorActions(first:1, where: { actionType_in: [Deposited, Migrated, OsTokenMinted, BoostDeposited] }) { id actionType assets shares hash createdAt vault { id } } }' \
    "allocatorActions"

  # Recipe 14a — whitelist entity name (PrivateVaultAccount, NOT whitelistAccounts)
  probe "private vault accounts (whitelist) — recipe 14" "$network" \
    '{ privateVaultAccounts(first:1) { id address vault { id } createdAt } }' \
    "privateVaultAccounts"

  # Recipe 14b — blocklist entity name (VaultBlockedAccount, NOT blocklistAccounts)
  probe "vault blocked accounts — recipe 14" "$network" \
    '{ vaultBlockedAccounts(first:1) { id address vault { id } createdAt } }' \
    "vaultBlockedAccounts"

  # Recipe 11 — vestings (entity existence; recipient field shape)
  probe "vesting escrows — recipe 11" "$network" \
    '{ vestingEscrows(first:1) { id token recipient } }' \
    "vestingEscrows"

  # Recipe 9 — sub-vaults. NOTE: SubVault.subVault is Bytes (address), NOT a nested
  # Vault object. To fetch sub-vault details, do a second `vault(id: <addr>)` query.
  probe "sub-vaults — recipe 9" "$network" \
    '{ subVaults(first:1) { id metaVault { id displayName } subVault } }' \
    "subVaults"

  # Reverse: parent meta-vaults for a sub-vault (no Vault.parentMetaVaults field on prod)
  probe "parent meta lookup (reverse subVaults) — recipe 9" "$network" \
    '{ subVaults(first:1, where: { subVault_not: "0x0000000000000000000000000000000000000000" }) { metaVault { id } subVault } }' \
    "subVaults"

  # Recipe 3 — exit requests
  probe "exit requests — recipe 3" "$network" \
    '{ exitRequests(first:1) { positionTicket totalAssets exitedAssets isClaimable isClaimed withdrawalTimestamp vault { id } } }' \
    "exitRequests"

  # Recipe 2 — allocators shape
  probe "allocators — recipe 2" "$network" \
    '{ allocators(first:1) { id address assets shares apy ltv ltvStatus mintedOsTokenShares totalEarnedAssets totalStakeEarnedAssets totalBoostEarnedAssets exitingAssets vault { id } } }' \
    "allocators"

  # Recipe 10 — distributor claims
  probe "distributor claims — recipe 10" "$network" \
    '{ distributorClaims(first:1) { id user tokens cumulativeAmounts unclaimedAmounts } }' \
    "distributorClaims"

  # Recipe 5 — leverage (Mainnet & Hoodi only; on Gnosis we just check the entity exists)
  probe "leverage strategy positions — recipe 5" "$network" \
    '{ leverageStrategyPositions(first:1) { id user vault { id } osTokenShares assets borrowLtv exitingPercent version } }' \
    "leverageStrategyPositions"

  # Recipe 17 — vaults by admin (operator filter)
  probe "vaults by admin — recipe 17" "$network" \
    '{ vaults(first:1, where: { admin_not: "0x0000000000000000000000000000000000000000" }) { id admin feeRecipient } }' \
    "vaults"

  # Recipe 18 — osToken exit requests
  probe "osToken exit requests — recipe 18" "$network" \
    '{ osTokenExitRequests(first:1) { positionTicket osTokenShares exitedAssets ltv owner vault { id } } }' \
    "osTokenExitRequests"

  # Recipe 19 — reward splitter share holders
  probe "reward splitter share holders — recipe 19" "$network" \
    '{ rewardSplitterShareHolders(first:1) { shares earnedVaultShares earnedVaultAssets address rewardSplitter { id totalShares vault { id } } } }' \
    "rewardSplitterShareHolders"

  # Reward splitter root entity (verify version, owner, claimer fields exist)
  probe "reward splitter root — recipe 19" "$network" \
    '{ rewardSplitters(first:1) { id version owner claimer totalShares vault { id } } }' \
    "rewardSplitters"

  # Aave singleton (recipe F) — check leverageMaxBorrowLtvPercent shape
  probe "aave singleton — follow-up F" "$network" \
    '{ aaves(first:1) { id borrowApy supplyApy leverageMaxBorrowLtvPercent osTokenSupplyCap osTokenTotalSupplied } }' \
    "aaves"

  # AllocatorSnapshot (Timestamp scalar — microseconds)
  probe "allocator snapshot — recipe 6" "$network" \
    '{ allocatorSnapshots(first:1, orderBy: timestamp, orderDirection: desc) { timestamp apy earnedAssets stakeEarnedAssets boostEarnedAssets totalAssets } }' \
    "allocatorSnapshots"

  # Follow-up G — token transfers
  probe "token transfers — follow-up G" "$network" \
    '{ tokenTransfers(first:1) { hash amount tokenSymbol from to timestamp } }' \
    "tokenTransfers"
done

# Backend GraphQL probes — verify exact shapes documented in endpoints.md.
[[ "$QUIET" == "1" ]] || echo "=== backend (mainnet) ==="

backend_probe() {
  local label="$1"
  local query="$2"
  local jq_path="$3"

  local body
  body=$(printf '{"query":%s}' "$(jq -Rs . <<<"$query")")
  local response
  response="$(curl -fsSL -m 30 -X POST -H 'content-type: application/json' --data "$body" https://mainnet-api.stakewise.io/graphql 2>/dev/null)" || {
    fail_count=$((fail_count + 1))
    failures+=("[backend/mainnet] $label — curl failed")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [backend/mainnet] $label — curl failed"
    return
  }
  if echo "$response" | jq -e '.errors' >/dev/null 2>&1; then
    fail_count=$((fail_count + 1))
    failures+=("[backend/mainnet] $label — GraphQL errors: $(echo "$response" | jq -c '.errors')")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [backend/mainnet] $label — GraphQL errors"
    return
  fi
  if ! echo "$response" | jq -e "$jq_path" >/dev/null 2>&1; then
    fail_count=$((fail_count + 1))
    failures+=("[backend/mainnet] $label — missing $jq_path in response: $(echo "$response" | jq -c '.data // .' | head -c 200)")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [backend/mainnet] $label — missing $jq_path"
    return
  fi
  pass_count=$((pass_count + 1))
  [[ "$QUIET" == "1" ]] || echo "  ok   [backend/mainnet] $label"
}

backend_probe "schema introspection" \
  '{ __schema { queryType { name } } }' \
  '.data.__schema.queryType.name'

backend_probe "exitStats.duration (Int seconds)" \
  '{ exitStats { duration } }' \
  '.data.exitStats.duration'

backend_probe "scoringDetails (validator perf breakdown)" \
  '{ scoringDetails(vaultAddress: "0xac0f906e433d58fa868f936e8a43230473652885") { attestationsEarned attestationsMissed proposedBlockCount missedBlockCount } }' \
  '.data.scoringDetails.proposedBlockCount'

backend_probe "vaults blacklist flag" \
  '{ vaults(id: "0xac0f906e433d58fa868f936e8a43230473652885") { id blacklisted hidden verified avgExitQueueLength } }' \
  '.data.vaults[0].id'

# Replica subgraph parity — verify each replica URL responds with the same
# vault shape and is within a few blocks of primary. The replica path differs
# per chain (Mainnet/Gnosis use `.../stage` on the replica host; Hoodi uses
# `.../prod`). Failures here are categorised separately so the issue body
# distinguishes infra drift from query drift.
[[ "$QUIET" == "1" ]] || echo "=== subgraph replicas ==="

replica_url() {
  case "$1" in
    mainnet) echo "https://graphs-replica.stakewise.io/mainnet/subgraphs/name/stakewise/stage" ;;
    gnosis)  echo "https://graphs-replica.stakewise.io/gnosis/subgraphs/name/stakewise/stage"  ;;
    hoodi)   echo "https://graphs-replica.stakewise.io/hoodi/subgraphs/name/stakewise/prod"    ;;
    *)       echo "" ;;
  esac
}

replica_probe() {
  local network="$1"
  local replica
  replica="$(replica_url "$network")"
  if [[ -z "$replica" ]]; then
    return
  fi

  local primary
  primary="$(subgraph_url "$network")"

  local query='{ _meta { block { number } } vaults(first:1, orderBy: totalAssets, orderDirection: desc) { id apy totalAssets } }'
  local body
  body=$(printf '{"query":%s}' "$(jq -Rs . <<<"$query")")

  local replica_resp primary_resp
  replica_resp="$(curl -fsSL -m 30 -X POST -H 'content-type: application/json' --data "$body" "$replica" 2>/dev/null)" || {
    fail_count=$((fail_count + 1))
    failures+=("[replica/$network] $replica — curl failed (network / 5xx)")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [replica/$network] curl failed"
    return
  }

  if echo "$replica_resp" | jq -e '.errors' >/dev/null 2>&1; then
    fail_count=$((fail_count + 1))
    failures+=("[replica/$network] GraphQL errors: $(echo "$replica_resp" | jq -c '.errors')")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [replica/$network] GraphQL errors"
    return
  fi

  if ! echo "$replica_resp" | jq -e '.data.vaults[0].id' >/dev/null 2>&1; then
    fail_count=$((fail_count + 1))
    failures+=("[replica/$network] missing vault shape in response")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [replica/$network] missing vault shape"
    return
  fi

  primary_resp="$(curl -fsSL -m 30 -X POST -H 'content-type: application/json' --data "$body" "$primary" 2>/dev/null)" || primary_resp=""
  local replica_block primary_block
  replica_block="$(echo "$replica_resp" | jq -r '.data._meta.block.number // empty')"
  primary_block="$(echo "$primary_resp" | jq -r '.data._meta.block.number // empty')"
  local lag=""
  if [[ -n "$replica_block" && -n "$primary_block" ]]; then
    lag=$((primary_block - replica_block))
    if (( lag < 0 )); then lag=$(( -lag )); fi
    if (( lag > 10 )); then
      fail_count=$((fail_count + 1))
      failures+=("[replica/$network] block lag $lag > 10 (replica $replica_block vs primary $primary_block)")
      [[ "$QUIET" == "1" ]] || echo "  FAIL [replica/$network] block lag $lag > 10"
      return
    fi
  fi

  pass_count=$((pass_count + 1))
  [[ "$QUIET" == "1" ]] || echo "  ok   [replica/$network] lag=${lag:-?} blocks"
}

for network in "${NETWORKS[@]}"; do
  replica_probe "$network"
done

# Public RPC liveness — sample one URL per network.
[[ "$QUIET" == "1" ]] || echo "=== public RPC liveness ==="
rpc_probe() {
  local network="$1"
  local url="$2"
  local expected_chain_id_hex="$3"

  local resp
  resp="$(curl -fsSL -m 10 -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$url" 2>/dev/null)" || resp=""

  local result
  result="$(echo "$resp" | jq -r '.result // empty' 2>/dev/null)"

  if [[ "$result" == "$expected_chain_id_hex" ]]; then
    pass_count=$((pass_count + 1))
    [[ "$QUIET" == "1" ]] || echo "  ok   [rpc/$network] $url"
  else
    fail_count=$((fail_count + 1))
    failures+=("[rpc/$network] $url — eth_chainId returned '$result', expected '$expected_chain_id_hex'")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [rpc/$network] $url"
  fi
}

rpc_probe mainnet https://ethereum-rpc.publicnode.com 0x1
rpc_probe gnosis  https://rpc.gnosischain.com         0x64
rpc_probe hoodi   https://rpc.hoodi.ethpandaops.io    0x88bb0

# Selector-correctness probes — make sure the rpc-fallback.md selectors actually
# work against the live contract on Mainnet (catches the sha3-256-vs-keccak-256
# class of bug that bit us once).
[[ "$QUIET" == "1" ]] || echo "=== RPC selectors (mainnet) ==="
rpc_selector_probe() {
  local label="$1"
  local contract="$2"
  local calldata="$3"

  local resp
  resp="$(curl -fsSL -m 10 -X POST -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$contract\",\"data\":\"$calldata\"},\"latest\"],\"id\":1}" \
    https://ethereum-rpc.publicnode.com 2>/dev/null)" || resp=""

  local result error
  result="$(echo "$resp" | jq -r '.result // empty' 2>/dev/null)"
  error="$(echo "$resp" | jq -r '.error.message // empty' 2>/dev/null)"

  if [[ -n "$result" && "$result" != "0x" ]]; then
    pass_count=$((pass_count + 1))
    [[ "$QUIET" == "1" ]] || echo "  ok   [rpc/selector] $label"
  else
    fail_count=$((fail_count + 1))
    failures+=("[rpc/selector] $label — call returned no result ($error)")
    [[ "$QUIET" == "1" ]] || echo "  FAIL [rpc/selector] $label — $error"
  fi
}

# MintTokenController.feePercent() — must return non-empty (e.g. 0x1f4 = 500 bps)
rpc_selector_probe "MintTokenController.feePercent()" \
  "0x2A261e60FB14586B474C208b1B7AC6D0f5000306" \
  "0x7fd6f15c"

# MintTokenController.convertToAssets(1e18)
rpc_selector_probe "MintTokenController.convertToAssets(1e18)" \
  "0x2A261e60FB14586B474C208b1B7AC6D0f5000306" \
  "0x07a2d13a0000000000000000000000000000000000000000000000000de0b6b3a7640000"

# MintTokenController.avgRewardPerSecond()
rpc_selector_probe "MintTokenController.avgRewardPerSecond()" \
  "0x2A261e60FB14586B474C208b1B7AC6D0f5000306" \
  "0x8d7d4520"

echo ""
echo "Summary: $pass_count passed, $fail_count failed."

if (( fail_count > 0 )); then
  echo ""
  echo "Failures:"
  for f in "${failures[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

exit 0
