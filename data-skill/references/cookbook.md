---
title: Cookbook — 15 worked Q&As
description: Concrete GraphQL queries for the common StakeWise data questions. Copy-paste ready.
---

# Cookbook — 15 worked Q&As

Each recipe: **the question**, **which endpoint**, **the GraphQL body**, **sample response shape**, and **how to format the answer**. Endpoints listed by URL shorthand — full URLs are in `endpoints.md`.

Common placeholders:
- `<USER>` — user's lowercase 0x address
- `<VAULT>` — vault's lowercase 0x address
- `<NOW>` — `Math.floor(Date.now() / 1000)` (Unix seconds)

All addresses **lowercase**. All `BigInt` results parsed via `BigInt(...)` before math; format with `(Number(bi) / 1e18).toFixed(4)` or `formatUnits`. APY/LTV as decimal strings — parse with `parseFloat` and multiply by 100 for percent.

---

## 1. "What's the APY of vault X on Mainnet?"

Endpoint: **subgraph (mainnet/prod)**

```graphql
{
  vaults(where: { id: "<VAULT>" }) {
    displayName
    apy
    baseApy
    extraApy
    allocatorMaxBoostApy
    feePercent
    totalAssets
    capacity
    score
  }
}
```

Response:
```json
{ "data": { "vaults": [ {
  "displayName": "Genesis Vault",
  "apy": "2.714087145506634939435841695774266",
  "baseApy": "2.0",
  "extraApy": "0.71",
  "allocatorMaxBoostApy": "1.85",
  "feePercent": 500,
  "totalAssets": "12345678900000000000000",
  "capacity": "100000000000000000000000",
  "score": "99.65"
} ] } }
```

Format:
- APY: `parseFloat(apy).toFixed(2) + '%'` → `2.71%` (apy is already in percent — do NOT multiply by 100)
- Base + Extra split if interesting. `allocatorMaxBoostApy` can be **positive** (boost adds yield) OR **negative** (active boost positions are underwater). When positive: "up to X% with boost" where X = `apy + allocatorMaxBoostApy`. When negative: UI shows range like `"2.71% to -5.13%"` — say "boost is currently a drag on yield (-N%)" so the user understands they may lose if they boost right now. Skip the boost line entirely if the value is exactly 0 (vault has no leverage strategy).
- Fee: `feePercent / 100` → `5%`
- TVL: `BigInt(totalAssets) / 10n**18n` → human ETH; multiply by `assetsUsdRate` for USD context.
- Score: backend-managed reliability/performance score, range `0–100` (already percent — e.g. `"99.65"` = 99.65%). Map to UI category using these **exact per-chain thresholds** (verified against `frontwise/apps/web/src/helpers/getters/getPerformanceData.ts` 2026-05-12):

  | Category | Mainnet score range | Gnosis score range |
  |---|---|---|
  | Excellent | ≥ 99.61 | ≥ 98.10 |
  | Good | 99.21 – 99.61 | 97.50 – 98.10 |
  | Moderate | 97.09 – 99.21 | 96.20 – 97.50 |
  | Bad | > 0 and < 97.09 | > 0 and < 96.20 |
  | — (no rating) | 0 or null | 0 or null |

  Always check `network` before applying the threshold; if you don't know the network, surface the raw score number instead of guessing a label. Verified end-to-end on Gnosis: Wunode (98.18) → Excellent ✓, node-sentinel (97.84) → Good ✓, CNC Core (97.43) → Moderate ✓, CNC Genesis (93.89) → Bad ✓.

---

## 2. "What's my position / balance / earnings on StakeWise?" — by address

Two flavours, same shape — only the `where:` filter changes.

### 2a. All positions of a user (no vault specified)

This is the right query for "what's my balance / earnings / positions on StakeWise" without a named vault. The subgraph returns every vault where the user holds any stake.

Endpoint: **subgraph**

```graphql
{
  allocators(where: { address: "<USER>" }) {
    assets
    shares
    apy
    ltv
    ltvStatus
    mintedOsTokenShares
    totalEarnedAssets
    totalStakeEarnedAssets
    totalBoostEarnedAssets
    exitingAssets
    vault {
      id
      displayName
      apy
      rate
      osTokenConfig { ltvPercent liqThresholdPercent }
    }
  }
}
```

If the array is empty → "this address has no positions on StakeWise [network]; if you used a different chain, tell me which".

For a single-figure overall total, sum `assets` over the array (BigInt arithmetic), divide by 1e18, multiply by `assetsUsdRate` from recipe 8 for a USD figure.

### 2b. Position in one specific vault — address + vault

Use only when the user names a vault.

Endpoint: **subgraph**

```graphql
{
  allocators(where: { address: "<USER>", vault: "<VAULT>" }) {
    assets
    shares
    apy
    ltv
    ltvStatus
    mintedOsTokenShares
    totalEarnedAssets
    totalStakeEarnedAssets
    totalBoostEarnedAssets
    exitingAssets
    vault {
      displayName
      rate
      osTokenConfig { ltvPercent liqThresholdPercent }
    }
  }
}
```

Response (positions with osToken minted look like):
```json
{ "data": { "allocators": [ {
  "assets": "1500000000000000000",
  "shares": "1428571428571428571",
  "apy": "6.71",
  "ltv": "0.65",
  "ltvStatus": "Healthy",
  "mintedOsTokenShares": "900000000000000000",
  "totalEarnedAssets": "12345678900000000",
  "totalStakeEarnedAssets": "10000000000000000",
  "totalBoostEarnedAssets": "2345678900000000",
  "exitingAssets": "0",
  "vault": { "displayName": "Genesis Vault", "rate": "1050000000000000000",
             "osTokenConfig": { "ltvPercent": "900000000000000000", "liqThresholdPercent": "920000000000000000" } }
} ] } }
```

Format:
- Stake: `1.5 ETH` in Genesis Vault
- Earnings: `0.01235 ETH` lifetime (0.01000 from staking + 0.00235 from boost)
- APY: `3.95%`
- osETH minted: `0.9 osETH`; LTV `65%`; status `Healthy`

If `allocators` array is empty → user has no position in this vault.

---

## 3. "When can I withdraw from the exit queue?"

Endpoint: **subgraph**

```graphql
{
  exitRequests(
    where: { owner: "<USER>", isClaimed: false }
    orderBy: timestamp
    orderDirection: desc
    first: 20
  ) {
    vault { displayName id }
    positionTicket
    totalAssets
    exitedAssets
    isClaimable
    withdrawalTimestamp
    timestamp
  }
}
```

Format (per request):
1. If `isClaimable` is `true` → **"You can withdraw now"** — show `totalAssets / 1e18` ETH ready to claim.
2. Else if `withdrawalTimestamp` is non-null → ETA = `new Date(withdrawalTimestamp * 1000)`; surface "estimated ready in N days/hours".
3. Else → query the **backend** for the vault's average exit queue length and add it to the request's `timestamp`:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ vaults(id:\"<VAULT>\") { avgExitQueueLength } }"}' \
  https://mainnet-api.stakewise.io/graphql
```

`avgExitQueueLength` is **seconds, vault-wide average**, NOT user's position in queue. ETA ≈ `request.timestamp + avgExitQueueLength`. Verified shape: Genesis vault returns ~149,398 (~41.5 hours), blacklisted vault `0x4fef9d...` returns ~102,264 (~28.4 hours). This is what the UI uses when `withdrawalTimestamp` is missing.

**Important caveat to tell the user**: this estimate is **vault-wide average**, not personal queue position. If many users queued before this request, actual ETA can be longer. There is no public per-position-in-queue ETA — protocol exit queue is FIFO but exact ordinal is not surfaced.

4. Edge case: `exitedAssets == totalAssets` but `isClaimable: false` — the exit pool has accumulated enough but this specific ticket hasn't reached the front of the FIFO queue. Tell the user "funds accrued but ticket still queued, ETA ≈ above estimate".

Empty result → no pending withdrawals.

---

## 4. "How much osETH can I mint? Am I healthy?"

If the user already has a position with `mintedOsTokenShares > 0`, recipe 2 gives `ltvStatus` already — quote it directly: `Healthy`/`Moderate`/`Risky`/`Unhealthy`.

To compute **headroom to mint more** (matching SDK `osToken.getMaxMintAmount()`):

```graphql
{
  allocators(where: { address: "<USER>", vault: "<VAULT>" }) {
    assets
    mintedOsTokenShares
    vault {
      osTokenConfig { ltvPercent leverageMaxMintLtvPercent }
    }
  }
  exchangeRates(first: 1) { osTokenAssetsRate }
}
```

SDK-canonical math (use this exactly to match what the app shows for "Max mint"):
```
ltvPercent         = osTokenConfig.ltvPercent      // wei-style: 9e17 = 90%
stakedAssets       = allocator.assets               // wei
mintedAssets       = (positionFromRPC, or estimate as mintedOsTokenShares × osTokenAssetsRate)

avgRewardPerSecond = MintTokenController.avgRewardPerSecond()  // RPC call, wei/sec
maxMintedAssets    = stakedAssets × ltvPercent / 1e18
hourBuffer         = (maxMintedAssets × avgRewardPerSecond × 3600) / 1e18
maxMintAssets      = maxMintedAssets - hourBuffer - mintedAssets

if (maxMintAssets > 0):
  maxMintShares    = convertToShares(maxMintAssets) - 1n   // -1n = rounding correction
else:
  maxMintAssets    = 0; maxMintShares = 0
```

Two non-obvious adjustments the SDK applies (otherwise the answer drifts from the app):

- **1-hour reward buffer** — subtracts what `maxMintedAssets` would accrue in the next hour so the user doesn't immediately overshoot their LTV cap after minting.
- **`-1n` share rounding fix** — corrects rounding error in `convertToShares`.

For exact RPC bodies see `rpc-fallback.md` (`MintTokenController.convertToShares` selector `0xc6e6f592`, `avgRewardPerSecond` is a no-arg view selector).

### Burn-for-unstake (how much osToken to repay before withdrawing stake)

When the user wants to unstake while having minted osToken, SDK's `osToken.getBurnAmountForUnstake()` computes:

```
ltvFraction = ltvPercent / 1e18                       // e.g. 0.90
assetsToBurn = mintedAssets - ltvFraction × stakedAssets
if (assetsToBurn > 0):
  sharesToBurn = convertToShares(min(assetsToBurn, mintedAssets))
else:
  sharesToBurn = 0n                                   // healthy enough, no burn needed
```

Use this when the user asks "how much osETH do I need to burn before unstaking N ETH". Without burning, the unstake would push LTV over the threshold and revert.

Health factor formula (when user wants a number rather than the precomputed status):
```
HF = (assets × liqThresholdPercent / 1e18) / currentMintedAssets
```
Map: `HF ≥ 1.02` Healthy; `≥ 1.01` Moderate; `≥ 1.00` Risky; `< 1.00` Unhealthy.

---

## 5. "What's my boost position? Is it healthy?"

Only Mainnet / Hoodi. On Gnosis say: "leverage strategy is not deployed on Gnosis."

Endpoint: **subgraph**

```graphql
{
  leverageStrategyPositions(where: { user: "<USER>", vault: "<VAULT>" }) {
    proxy
    osTokenShares
    assets
    borrowLtv
    exitingPercent
    exitingOsTokenShares
    exitingAssets
    version
    exitRequest {
      timestamp totalAssets exitedAssets isClaimable withdrawalTimestamp
    }
    vault { osTokenConfig { ltvPercent } allocatorMaxBoostApy apy }
  }
}
```

Then fetch the Aave debt for this proxy:

```graphql
{
  aavePositions(where: { user: "<PROXY_FROM_PREVIOUS_QUERY>" }) {
    suppliedOsTokenShares
    borrowedAssets
  }
}
```

### Canonical Boost balance formula (matches `app.stakewise.io` exactly)

The "Boost" number app.stakewise.io shows on the vault page is **NOT** `osTokenShares × rate` and **NOT** `(suppliedOsETH × rate − borrowedETH)`. Both are wrong (the latter misses accrued rewards by ~`LeverageStrategyPosition.assets` ETH).

The correct formula uses the strategy contract's own accounting from `LeverageStrategyPosition` + one RPC call. Verified against the SDK source (`v3-sdk/src/services/boost/requests/getData/index.ts`) and against the UI on `0xe2008b01a2ad0a9aeea9f71ecc6a176138553a61` 2026-05-12 — matches to all 2 decimal places.

```
shares       = LeverageStrategyPosition.osTokenShares   // raw shares locked in strategy (wei)
rewardAssets = LeverageStrategyPosition.assets          // accrued ETH-denominated rewards still in strategy (wei)
rewardShares = MintTokenController.convertToShares(rewardAssets)  // RPC eth_call, returns wei

boostBalanceShares = shares + rewardShares              // osETH shares — this is what the UI displays as "Boost" (wei-scaled)
boostBalanceETH    = boostBalanceShares × osTokenAssetsRate    // wei × decimal rate (e.g. 1.057) = still wei-scaled, semantically "ETH-denominated wei"
boostBalanceUSD    = boostBalanceETH × assetsUsdRate / 1e18    // wei × decimal USD/ETH ÷ 1e18 = human USD
```

`AavePosition.suppliedOsTokenShares` and `AavePosition.borrowedAssets` are still useful — they explain *how* the strategy is positioned (supply N osETH as collateral, borrow M ETH) — but they don't appear in the user-facing Boost balance. They DO appear in the borrow-status math (`borrowLtv`).

### Worked example — verified 2026-05-12

User `0xe2008b01...` in Genesis (Mainnet):

| Field | Value (wei) | Human |
|---|---|---|
| `LeverageStrategyPosition.osTokenShares` | `2014223151544519116655` | 2,014.22 osETH |
| `LeverageStrategyPosition.assets` (rewardAssets) | `43600226828397314098` | 43.60 ETH |
| `LeverageStrategyPosition.borrowLtv` | `"0.9311849..."` | 93.12% |
| `AavePosition.suppliedOsTokenShares` (proxy = leverage.proxy) | `27291…` | 27,291.35 osETH |
| `AavePosition.borrowedAssets` | `27216…` | 27,216.73 ETH |
| `convertToShares(43.60 ETH)` → `0x234fb02fd3298be61` | — | 40.71 osETH |
| **`boostBalanceShares = 2014.22 + 40.71`** | — | **2,054.93 osETH** |
| Boost USD = 2,054.93 × 1.0710 × $2298.37 | — | **$5.06m** |

UI shows `Boost: 2,054.93 ($5.06m)` ✓ exact match.

### Format
- **Boost balance (UI parity)**: `boostBalanceShares` osETH (token icon = osETH/osGNO, not ETH/GNO) — quote both the share count and the USD value.
- **Borrowed (separately if asked)**: `AavePosition.borrowedAssets / 1e18` ETH. Multiply by `assetsUsdRate` for USD.
- **Borrow LTV**: `parseFloat(borrowLtv) * 100` → percent (e.g. `"0.9311"` → 93.11%). **This is Aave-side LTV, not vault-side osToken LTV** — see `units-and-gotchas.md` "Two different LTVs".
- **Status thresholds** (SDK-canonical, stricter than Aave's 94.5% to warn early): `borrowLtv ≤ 0.938` Healthy; `≤ 0.945` Moderate; else Risky. Aave liquidates at ~94.5%; the SDK's `0.938` ceiling gives ~0.7% buffer.
- **If `exitingPercent > 0`** → user is exiting; show ETA from `exitRequest.withdrawalTimestamp`.
- **Effective `Your APY`** (the `userApy` shown next to Boost): if the user is actively boosted but the boost is currently underwater (e.g. Aave borrow APY > vault APY × leverage gain), `userApy < vault.apy`. The UI marks this with a warning icon when `boostedShares > 0`. The skill should compare `Allocator.apy` to `Vault.apy` and explain the delta if boost is active.

---

## 6. "Show my APY / earnings history for the last N days"

Endpoint: **subgraph**

```graphql
{
  allocatorSnapshots(
    where: {
      allocator_: { address: "<USER>", vault: "<VAULT>" }
      timestamp_gte: <NOW_MINUS_N_DAYS_MICROSECONDS>
    }
    orderBy: timestamp
    orderDirection: desc
    first: 365
  ) {
    timestamp
    apy
    totalAssets
    earnedAssets
    stakeEarnedAssets
    boostEarnedAssets
  }
}
```

**Snapshot timestamps are in MICROSECONDS** (verified: `1778457600000000` = Unix 1778457600 = 2026-05-11 00:00:00 UTC; boundary is exactly UTC 00:00 daily). To compute the filter for last N days:

```js
const nowSec = Math.floor(Date.now() / 1000)
const cutoffMicros = (nowSec - N * 86400) * 1_000_000
// pass as a numeric string to the GraphQL variable: String(cutoffMicros)
```

Format: build a daily table. Highlight:
- Average APY across the window: `avg(parseFloat(apy) for each)` — already in percent, append `%`
- Total earned: `sum(BigInt(earnedAssets))` then divide by 1e18 — **may be negative** if slashing exceeded rewards in some days; surface honestly
- Stake vs boost split: sum each separately (`boostEarnedAssets + stakeEarnedAssets == earnedAssets` per row)
- Convert each row's timestamp to display: `new Date(Number(timestamp) / 1000)` (microseconds → ms)

Cap user requests to ≤ 1000 days.

---

## 7. "Total ETH staked in StakeWise"

Endpoint: **subgraph** (one query per chain, parallel)

```graphql
{ networks(first: 1) { totalAssets usersCount totalEarnedAssets } }
```

Run against Mainnet + Gnosis (+ optionally Hoodi if asked). Sum:
- TVL (Mainnet) = ETH; TVL (Gnosis) = GNO — units differ across chains, do not naively sum without converting.
- Use `exchangeRates` to convert GNO → USD if user wants a single $ total.

Mainnet only is fine if the user asked "ETH staked" specifically.

---

## 8. "What's the osETH/ETH and ETH/USD rate?"

Endpoint: **subgraph** (Mainnet for ETH-related, Gnosis for GNO-related)

```graphql
{
  exchangeRates(first: 1) {
    osTokenAssetsRate
    assetsUsdRate
    swiseUsdRate
    usdToEurRate usdToGbpRate usdToCnyRate usdToJpyRate usdToKrwRate usdToAudRate
  }
}
```

Format:
- 1 osETH = `parseFloat(osTokenAssetsRate)` ETH
- 1 ETH = `$` + `parseFloat(assetsUsdRate)`
- Fiat: `usdAmount × usdToEurRate` etc.

**Gnosis cross-network rule (CANONICAL — confirmed with StakeWise team):**

Two fields on Gnosis exchange-rate queries should NOT be used for user-facing display:
1. `usdToEurRate`, `usdToGbpRate`, … fiat fields — often empty/zero on Gnosis subgraph.
2. `osTokenAssetsRate` — exists on Gnosis subgraph (returns ~1.1480) but is **legacy/internal**. Using it inflates osGNO USD value by ~7%.

For any user-facing display on Gnosis:

```
fiatRates       ← Mainnet subgraph (usdToEurRate, …)
osTokenAssetsRate ← Mainnet subgraph (~1.0710)
assetsUsdRate   ← Gnosis subgraph ($131.41 GNO/USD), keep native — this is GNO price
```

Compose USD for an osGNO position:
```
osGNO_USD = mintedOsTokenShares / 1e18 × Mainnet.osTokenAssetsRate × Gnosis.assetsUsdRate
```

Verified against UI on `Genesis` (10,168 osGNO → $1.43m) and `NEDO` (2,595 osGNO → $365.33k) — formula matches to the dollar.

For GNO-only amounts (staked, earned), use Gnosis `assetsUsdRate` directly with no rate adjustment.

---

## 9. "What sub-vaults does meta vault X hold?"

Endpoint: **subgraph**. **Two queries** are needed because `SubVault.subVault` is a `Bytes` scalar (the child vault's address), not a nested `Vault` object — you cannot do `subVault { id ... }`.

Step 1 — list the sub-vault addresses and the meta-vault's allocator row inside each:

```graphql
{
  meta: vault(id: "<META_VAULT>") {
    id displayName totalAssets apy
    subVaults { subVault }
  }
  positions: allocators(where: { address: "<META_VAULT>" }) {
    vault { id }
    assets shares apy totalEarnedAssets
  }
  exits: exitRequests(where: { receiver: "<META_VAULT>", isClaimed: false }) {
    vault { id } totalAssets
  }
}
```

Step 2 — fetch sub-vault details by address (one aliased query per sub):

```graphql
{
  s0: vault(id: "<SUB0>") { id displayName apy totalAssets feePercent isCollateralized }
  s1: vault(id: "<SUB1>") { id displayName apy totalAssets feePercent isCollateralized }
  # … repeat per sub-vault returned in Step 1
}
```

Format: join by sub-vault address — table rows of `displayName, apy %, meta's allocation (from positions[i].assets), pending exit (sum of exits[i].totalAssets), feePercent, isCollateralized`.

If the question is **reversed** — "which meta vaults hold this sub-vault?" — use the reverse `subVaults` filter (there is **no** `Vault.parentMetaVaults` field on prod):

```graphql
{
  subVaults(where: { subVault: "<SUB_VAULT>" }) {
    metaVault { id displayName totalAssets apy }
  }
}
```

**Nested meta-vaults** — meta-vaults can contain other meta-vaults as sub-vaults (verified 2026-05-12 on Hoodi: `0x15639e82…` → `0x34284c27…` → `0xba447498…`). When you fetch a sub-vault's details in step 2 and see `isMetaVault: true`, recurse: apply step 1 of recipe 9 with that address as the new `<META_VAULT>` to expand its composition. Stop when you hit non-meta leaves or when the depth would exceed 3 (rare in practice; warn the user instead of querying further). For each meta layer, the user-visible APY and totalAssets aggregate through to the outermost meta-vault automatically — you don't need to re-derive them.

---

## 10. "Do I have unclaimed merkle rewards / airdrops?"

Endpoint: **subgraph** + the `exchangeRates` singleton for USD valuation.

```graphql
{
  distributorClaims(where: { user: "<USER>" }) {
    tokens
    cumulativeAmounts
    unclaimedAmounts
  }
  exchangeRates(first: 1) {
    swiseUsdRate
    osTokenAssetsRate
    assetsUsdRate
  }
}
```

The three arrays are parallel — index together: `tokens[i]`, `cumulativeAmounts[i]`, `unclaimedAmounts[i]` describe one merkle reward entry. Empty arrays = nothing to claim.

### Known token addresses on Mainnet (lowercase)

| Token | Address | USD via |
|---|---|---|
| **SWISE** | `0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2` | `amount × swiseUsdRate` |
| **osETH** | `0xf1c9acdc66974dfb6decb12aa385b9cd01190e38` | `amount × osTokenAssetsRate × assetsUsdRate` |

For unrecognised tokens, surface the address and tell the user "this is an ERC20 — paste the address into [Etherscan](https://etherscan.io/token/<addr>) for the symbol".

### Verified worked example

User `0xe2008b01a2ad0a9aeea9f71ecc6a176138553a61` on Mainnet (2026-05-12):

```
unclaimedAmounts: [
  "141257134143310245082578",  // SWISE wei → 141,257.134 SWISE
  "1288222628079081422"        // osETH wei → 1.28822 osETH
]
exchangeRates: {
  swiseUsdRate:      "0.003809667036...",
  osTokenAssetsRate: "1.070961484221...",
  assetsUsdRate:     "2298.36761"
}
```

```
SWISE USD = 141257.134 × 0.003809667 = $538.14
osETH USD =     1.28822 × 1.0709615 × 2298.36761 = $3,170.91
Total     =                                        $3,709.05  ← matches `Claim` badge in the header to the cent
```

Algorithm in pseudo-JS:

```js
const TOKEN_NAME = {
  '0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2': 'SWISE',
  '0xf1c9acdc66974dfb6decb12aa385b9cd01190e38': 'osETH',
}
function rewardUsd(tokenAddr, amountWei, rates) {
  const amount = Number(amountWei) / 1e18  // BigInt → Number safe here, amounts < 1e15 wei in practice
  const t = tokenAddr.toLowerCase()
  if (t === '0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2') return amount * parseFloat(rates.swiseUsdRate)
  if (t === '0xf1c9acdc66974dfb6decb12aa385b9cd01190e38') return amount * parseFloat(rates.osTokenAssetsRate) * parseFloat(rates.assetsUsdRate)
  return null  // unknown token — show wei amount, omit USD
}
```

### Format
- Per token: `<Symbol>: <amount> (~$<usd>)`
- Total: sum USD values across recognised tokens; for unrecognised, append "(+ N unknown tokens)" if any.
- If `unclaimedAmounts[i]` is `"0"` for a row but `cumulativeAmounts[i]` is non-zero → the user already claimed everything for that token. Surface "0 claimable, lifetime <cumulative>" if asked about history; otherwise skip the row.

Empty `tokens` array → "no unclaimed merkle rewards on this network for this address".

---

## 11. "What can I claim from my vesting right now?"

Endpoint: **subgraph** + on-chain RPC. The subgraph only stores `{ id, token, recipient }` — schedule and amounts come from the escrow contract.

Step 1 — find escrows belonging to the user (a recipient can have multiple grants):

```graphql
{ vestingEscrows(where: { recipient: "<USER>" }) { id token } }
```

(`token` is the ERC20 token address as a hex string, e.g. `0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2` = SWISE.)

Step 2 — for each escrow address, batch six `eth_call`s. Trust the contract's own `unclaimedAmount()` — it already handles cliff and pause logic, no manual math needed. From `rpc-fallback.md` § VestingEscrow:

| Function | Selector | Why call it |
|---|---|---|
| `unclaimedAmount()` | `0x6efce095` | What you can claim right now (wei) |
| `totalAmount()` | `0x1a39d8ef` | Full grant size, for context |
| `claimedAmount()` | `0x9668ceb8` | What's already been withdrawn |
| `startTime()` | `0x78e97925` | Unix seconds — when vesting starts |
| `endTime()` | `0x3197cbb6` | Unix seconds — when fully vested |
| `cliffLength()` | `0xe0131fd1` | Seconds offset from `startTime`; until `startTime + cliffLength` nothing vests |
| `paused()` | `0x5c975abb` | If true, claiming is currently disabled |

Sample `eth_call` body for `unclaimedAmount()`:

```json
{
  "jsonrpc": "2.0",
  "method": "eth_call",
  "params": [
    { "to": "<ESCROW_ADDR>", "data": "0x6efce095" },
    "latest"
  ],
  "id": 1
}
```

Decode the 32-byte hex result as a `uint256`.

Step 3 — format the answer:
- If `unclaimedAmount() > 0` → "you can claim **X TOKEN** now from escrow `<ESCROW>`".
- Else if `now < startTime + cliffLength` → "still in cliff; first unlock at `<startTime + cliffLength>` ISO".
- Else if `now ≥ endTime` and `claimedAmount == totalAmount` → "this grant is fully claimed".
- If `paused() == true` → add "(claiming temporarily paused by admin)".

If `vestingEscrows` returned no rows → "no vesting grants found for this address on this network".

### Verified worked example — 2026-05-12

Escrow `0x73336d0467e4c87031d812363c27cc93714a0b30` on Mainnet:

| Selector | Raw return | Decoded |
|---|---|---|
| `totalAmount()` `0x1a39d8ef` | `0x4a1d89bb94865ec00000` | 350,000 SWISE |
| `vestedAmount()` `0x44b1231f` | `0x4a1d89bb94865ec00000` | 350,000 SWISE |
| `claimedAmount()` `0x9668ceb8` | `0x0` | 0 SWISE |
| `unclaimedAmount()` `0x6efce095` | `0x4a1d89bb94865ec00000` | 350,000 SWISE |
| `startTime()` `0x78e97925` | `0x61564f80` | 1633046400 = 2021-10-01 UTC |
| `endTime()` `0x3197cbb6` | `0x64277400` | 1680307200 = 2023-04-01 UTC |
| `cliffLength()` `0xe0131fd1` | `0x0` | 0 seconds (no cliff) |
| `paused()` `0x5c975abb` | `0x0` | false |
| `recipient()` `0x66d003ac` | `0xc295…4556` | `0xc295cce09878094d83b04a8f64669344836c4556` |
| `token()` `0xfc0c546a` | `0x48c3…2fa2` | SWISE token address |

Answer to "what can I claim?": "Your vesting grant of 350,000 SWISE finished vesting on 2023-04-01 UTC. You have never claimed, so **350,000 SWISE is available right now** from escrow `0x73336d…0b30`. Claim by calling `claim()` on that contract."

USD valuation (optional, requires Mainnet `exchangeRates`): `350000 × swiseUsdRate (~0.00381) ≈ $1,333` at today's rate.

---

## 12. "Show my StakeWise transaction history"

Endpoint: **subgraph**

```graphql
{
  allocatorActions(
    where: { address: "<USER>" }
    orderBy: createdAt
    orderDirection: desc
    first: 50
  ) {
    hash
    createdAt
    actionType
    assets
    shares
    vault { displayName id }
  }
}
```

Format: chronological list. For each:
- Date: `new Date(createdAt * 1000)`
- Action: human-readable form of `actionType` (Deposited → "Deposited", OsTokenMinted → "Minted osETH", ExitQueueEntered → "Entered exit queue", BoostDeposited → "Joined Boost", etc.)
- Amount: prefer `assets`; fall back to `shares` if `assets` is null.
- Vault: `displayName` or shortened address
- Tx: shortened hash `0x1234...abcd`

Optional filter by type. The `AllocatorActionType` enum values are: `VaultCreated`, `Deposited`, `Migrated`, `Redeemed`, `TransferIn`, `TransferOut`, `ExitQueueEntered`, `ExitedAssetsClaimed`, `OsTokenMinted`, `OsTokenBurned`, `OsTokenLiquidated`, `OsTokenRedeemed`, `BoostDeposited`, `BoostExitQueueEntered`, `BoostExitedAssetsClaimed`.

**UI label mapping** (verified against `app.stakewise.io`):

| Subgraph enum | UI label shown to user |
|---|---|
| `Deposited` | `+Stake` |
| `Migrated` | `+Migration` (V2 → V3 migration credit) |
| `OsTokenMinted` | `+osETH Mint` / `+osGNO Mint` |
| `OsTokenBurned` | `-osETH Burn` / `-osGNO Burn` |
| `ExitQueueEntered` | `-Queue entered` |
| `ExitedAssetsClaimed` | `-Unstake` (actual withdrawal after the queue settles) |
| `BoostDeposited` | (Mainnet only) shown as boost-side `+Stake` |
| `BoostExitQueueEntered` | `-osETH Unboost` |
| `BoostExitedAssetsClaimed` | (boost-side `-Unstake`) |
| `Redeemed` / `OsTokenRedeemed` | (osETH redemption queue settle) |
| `OsTokenLiquidated` | (rare — appears for liquidation events) |
| `TransferIn` / `TransferOut` | (token transfer attribution) |
| `VaultCreated` | (operator-side, single event per vault) |

When formatting transaction history for a user, prefer the UI label phrasing — it's what they expect to see.

```graphql
allocatorActions(where: { address: "<USER>", actionType_in: [Deposited, Redeemed] }) { ... }
```

---

## 13. "Tell me everything about this vault"

Endpoint: **subgraph** — one big query for `/vault/[addr]`-style detail.

```graphql
{
  vaults(where: { id: "<VAULT>" }) {
    displayName description imageUrl
    apy baseApy extraApy allocatorMaxBoostApy
    feePercent lastFeePercent lastFeeUpdateTimestamp
    totalAssets capacity totalShares rate queuedShares exitingAssets exitingTickets
    score
    version createdAt
    isPrivate isBlocklist isErc20 isOsTokenEnabled isMetaVault isCollateralized isGenesis canHarvest
    tokenName tokenSymbol
    admin feeRecipient mevEscrow validatorsManager whitelister blocklistManager
    whitelistCount blocklistCount
    osTokenConfig { ltvPercent liqThresholdPercent leverageMaxMintLtvPercent }
  }
  parents: subVaults(where: { subVault: "<VAULT>" }) {
    metaVault { id displayName }
  }
}
```

(`Vault.parentMetaVaults` and `Vault.subVaultsCount` do **not** exist on prod — use the reverse `subVaults(where: { subVault })` query to find parent meta-vaults, and `subVaults(where: { metaVault })` plus a `.length` check when you need a sub-vault count.)

Format as a structured summary:
- **Header**: `displayName` + version + creation date
- **Performance**: APY breakdown (`apy`, `baseApy`, `extraApy`, optional `allocatorMaxBoostApy`) + fee
- **Capacity**: TVL / Capacity / utilisation %
- **Config flags**: list which booleans are true; note `mevEscrow == null` ⇒ uses smoothing pool, else "owns escrow"
- **osToken**: LTV %, liquidation %, leverage cap (see units-and-gotchas for the 18-decimal scale)
- **Operator**: admin, fee recipient
- **If `isMetaVault`**: link to recipe 9 to enumerate sub-vaults
- **If `parents` array non-empty**: list them ("this vault is a sub-vault of …")

---

## 14. "Am I whitelisted in vault X?"

Endpoint: **subgraph**

First check `Vault.isPrivate`:

```graphql
{ vaults(where: { id: "<VAULT>" }) { isPrivate isBlocklist whitelister blocklistManager } }
```

If `isPrivate == false` → "this vault is public — anyone can stake".

Else check whitelist membership (entity is `PrivateVaultAccount`, query is `privateVaultAccounts`):

```graphql
{ privateVaultAccounts(where: { vault: "<VAULT>", address: "<USER>" }) { id createdAt } }
```

Non-empty result → "you are whitelisted". Empty → "you are NOT on the whitelist; contact the vault admin (`<admin>`)".

If `isBlocklist == true` also check (entity is `VaultBlockedAccount`, query is `vaultBlockedAccounts`):

```graphql
{ vaultBlockedAccounts(where: { vault: "<VAULT>", address: "<USER>" }) { id createdAt } }
```

Non-empty → "you are blocked from this vault".

---

## 15. "Top 10 vaults filtered by criteria"

Examples: "top 10 vaults with fee < 5% and APY > 4%, sorted by TVL".

Endpoint: **subgraph**

```graphql
{
  vaults(
    where: {
      feePercent_lt: 500
      apy_gt: "4.0"
      isOsTokenEnabled: true
      isCollateralized: true
      isPrivate: false
      isMetaVault: false
    }
    orderBy: totalAssets
    orderDirection: desc
    first: 10
  ) {
    id displayName apy baseApy feePercent totalAssets capacity allocatorMaxBoostApy
  }
}
```

**Display fallback for missing names:** when `displayName` is null the UI does **not** filter the vault out — it renders the truncated address instead (e.g. `0x57…c11c`). Verified on `0x579ecfe4270ce23589d8b0a41dd234316018c11c` (1,943 ETH TVL, `displayName: null`) which appears in the Mainnet marketplace.

**Real reason a vault disappears from the marketplace** is the **backend `blacklisted` flag**, not subgraph `displayName`. Verified on `0x4fef9d741011476750a243ac70b9789a63dd47df` (72k ETH TVL, blacklisted=true → not shown). To mirror the UI list precisely:

1. Query the subgraph with the natural filters (`isMetaVault: false`, ordering, TVL/APY bounds).
2. Fetch the backend's blacklist for the same network: `https://{network}-api.stakewise.io/graphql` body `{ vaults(blacklisted: true) { id } }`. Build a Set of blacklisted IDs.
3. Exclude any subgraph result whose `id` is in that set.
4. For display, fallback `name = vault.displayName ?? short(vault.id)` where `short("0x579e…c11c")` is the 4-char-each truncation.

Available filter operators on numeric fields: `_gt`, `_gte`, `_lt`, `_lte`, `_in`. On boolean: exact match. On nullable: `_not: null`.

---

## 16. "How has vault X's APY changed over the last N days?"

Endpoint: **subgraph**

```graphql
{
  vaultSnapshots(
    where: { vault: "<VAULT>", timestamp_gte: <NOW_MINUS_N_DAYS_MICROSECONDS> }
    orderBy: timestamp
    orderDirection: desc
    first: 365
  ) {
    timestamp
    apy
    totalAssets
    earnedAssets
  }
}
```

**Reminder**: `VaultSnapshot.timestamp` is in **microseconds** (see units-and-gotchas). Compute the filter as `(nowSec - N*86400) * 1_000_000`.

Format: build a daily table or summary. Highlight average APY across the window (`avg(parseFloat(apy))` — already in percent, append `%`), TVL change (latest `totalAssets` vs earliest, % change), and the trend (rising / flat / falling). If user gave a comparison window ("last week vs last month"), run two queries with different `timestamp_gte` and diff the averages.

For aggregated daily intervals over a longer horizon, also consider the daily aggregation collection (same data, pre-rolled):
```graphql
vaultStats: vaultSnapshots(first: $limit, orderBy: timestamp, orderDirection: desc, where: { vault: "<VAULT>" }) { ... }
```

---

## 17. "Show me all vaults run by operator X" + operator dashboard data

Endpoint: **subgraph**, plus **backend** for validators and scoring breakdown.

### Identify operator roles

A vault has FOUR independent role addresses; the operator may control one, some, or all of them. Query any of them — they're all indexed lowercase Bytes filters:

| Role | Subgraph field | What they do |
|---|---|---|
| Admin | `Vault.admin` | Top-level — changes fee, blocklist, MEV escrow, manages the vault. |
| ValidatorsManager | `Vault.validatorsManager` | Registers validators against the vault's deposit data. Often a separate hot key from admin. |
| DepositDataManager | `Vault.depositDataManager` | Maintains the deposit-data merkle root (the validator keys' deposit data). |
| FeeRecipient | `Vault.feeRecipient` | Where the vault's protocol-fee shares go. Can be the admin, a multisig, or a `RewardSplitter` contract. |

For "what vaults does this operator run?" the broadest query is `OR` across all four:

```graphql
{
  asAdmin:               vaults(where: { admin:               "<OP>" }) { id displayName }
  asValidatorsManager:   vaults(where: { validatorsManager:   "<OP>" }) { id displayName }
  asDepositDataManager:  vaults(where: { depositDataManager:  "<OP>" }) { id displayName }
  asFeeRecipient:        vaults(where: { feeRecipient:        "<OP>" }) { id displayName }
}
```

(Subgraph doesn't support `OR` in a single `where`, so do them as four aliased queries in one HTTP round-trip.) Deduplicate the `id`s client-side. Verified Mainnet admin examples: Genesis `0xf330b5fe…` is admin AND depositDataManager (same address for both); validatorsManager is a different address `0xacdc961c…`.

### Per-vault operator stats

For each vault the operator runs, the relevant subgraph fields:

```graphql
{
  vault(id: "<VAULT>") {
    id displayName apy baseApy extraApy feePercent feeRecipient
    totalAssets capacity totalShares score
    consensusReward lockedExecutionReward unlockedExecutionReward slashedMevReward
    mevEscrow rewardsTimestamp lastFeeUpdateTimestamp canHarvest isCollateralized
    admin validatorsManager depositDataManager
  }
}
```

- **Fee revenue (lifetime, approximate)**: `Vault.totalShares × Vault.rate × Vault.feePercent / 10000` — coarse. For per-day income use the daily aggregation: each `VaultSnapshot.earnedAssets × feePercent / 10000` summed over the window. If a `RewardSplitter` is in place (the splitter's address equals `Vault.feeRecipient`), the operator's actual cut is `RewardSplitterShareHolder.earnedVaultAssets` for the operator's `address` — already net.
- **Validator activity** (NOT in subgraph): use backend `vaultValidators(vaultAddress, statusNotIn: ["withdrawal_done"], first: N, skip: 0) { publicKey apr income createdAt }` — gives per-validator APR and lifetime income (wei).
- **Score breakdown** (NOT in subgraph): backend `scoringDetails(vaultAddress) { attestationsEarned attestationsMissed proposedBlockCount missedBlockCount }` — these are summed across the vault's validators for a recent window; the UI uses them to populate the "Validators performance" sub-card.
- **MEV missed** (lifetime, NOT in subgraph): backend `vaults(id) { mevMissed }` — lifetime wei missed because the vault used a relay that occasionally skipped a slot.

### UI route note

The `/operate` page on `app.stakewise.io` is **gate-kept by wallet** — only the connected admin sees their vaults; visiting `/operate/<network>/<vault>` directly returns 404 even for a vault that exists. Verified 2026-05-12 (logged in as Hoodi admin `0xec6613…5907` showing 8 vaults; mainnet wallet without admin role saw an empty list).

So a non-admin LLM caller can ALWAYS read the operator-relevant data straight from subgraph + backend without needing the UI; the skill should answer "what's the state of my operator vault" without telling the user to visit the page.

### UI banner mapping (operator side)

When the admin opens `/vault/<network>/<vault>` while connected as the admin wallet, UI surfaces some banners and panels that map directly to data fields:

| UI element | Data source | Trigger |
|---|---|---|
| "Setup validator(s)" purple banner | `Vault.isCollateralized: false` AND backend `vaultValidators` returns empty | Vault hasn't registered any validator yet — admin still needs to import deposit-data and call `registerValidators`. |
| "Unverified Vault" yellow banner | Backend `vaults(id).verified: false` | Vault hasn't been manually verified by StakeWise support. |
| "Vault access" button (top right) | Always shown to admin | Opens a modal listing `PrivateVaultAccount` (if `isPrivate: true`) or `VaultBlockedAccount` entries (if `isBlocklist: true`). |
| "Settings" button (top right) | Always shown to admin | Lets the admin change `feePercent`, `feeRecipient`, `metadataIpfsHash`, MEV escrow type, blocklist/whitelist managers. |
| "Vault block list" modal — "OFAC list sync status" | Compare backend `ofacAddresses` (87 addresses on Hoodi today) to subgraph `vaultBlockedAccounts(where: { vault })`. If subgraph set ⊋ OFAC set → "Not synced". | Lets the admin push the latest OFAC list into their vault contract via on-chain `addToBlocklist` calls. |

**OFAC checksum gotcha:** backend `ofacAddresses` returns **mixed-case (checksummed) addresses** like `0x0330070FD38Ec3bB94F58FA55D40368271E9e54A`, while subgraph stores addresses lowercase. Lowercase the backend list before set-diffing.

### Verified UI "Details" panel mapping

The `Details` panel on the vault page (visible to any visitor, not just admin) maps to subgraph fields cleanly. Reference values from Hoodi BlockList vault `0x995d1aa…94d2` 2026-05-12 — UI showed each row as below:

| UI label | UI value | Subgraph field |
|---|---|---|
| Vault type | `Public` | `isPrivate: false` (true → `Private`; if `isBlocklist: true` add "Blocklist" sub-label) |
| Vault capacity | `∞` | `capacity: "115792089237316195423570985008687907853269984665640564039457584007913129639935"` (i.e. `2^256 - 1` → render as ∞) |
| Contract address | `0x99...94D2` | `vault.id` (truncated, checksummed in UI) |
| Vault admin | `0xEC...5907` | `vault.admin` |
| Vault fee recipient | `0xEC...5907` | `vault.feeRecipient` |
| Block reward recipient | `0x51...63bd` | When `mevEscrow == null`: SharedMevEscrow contract (look up via SDK config — same per network). When non-null: `mevEscrow` directly. |
| Staking fee | `5%` | `feePercent: 500` (bps → `feePercent / 100`%) |
| Version | `5` | `vault.version: "5"` |
| Date created | `24 April 2026` | `vault.createdAt: 1777013460` (Unix seconds) |

When the admin is connected, the right-hand sidebar additionally shows "Your APY / Earned rewards / osETH status / Staked ETH / Minted osETH / Boost" — same fields as for any allocator on a vault (recipe 2), filtered for the admin's own position.

### Operator-side history (Actions table)

The "Actions" table on the operator vault page shows recent `AllocatorAction` rows filtered by `vault: <vaultAddr>` (not by `address: <admin>`). For the BlockList Hoodi vault we saw "+ Vault creation" — this is the `VaultCreated` action emitted once per vault at deployment. The Actions table has two sub-tabs **"All actions"** and **"My actions"** — the former drops the address filter, the latter adds `address: <admin>`. UI labels match recipe 12's mapping table.

### Settings modal — what each tab manages

Clicking "Settings" on the admin vault page opens a tabs modal. Tabs are gated by the admin's role (from `frontwise/apps/web/src/views/VaultView/Modals/settings/EditVaultModal/util/useTabs.ts` verified 2026-05-12):

| Tab | Visible when | Manages |
|---|---|---|
| **Branding** | `isVaultAdmin` | `Vault.displayName`, `description`, `imageUrl` — all stored together as JSON in IPFS, the hash recorded on-chain in `Vault.metadataIpfsHash`. Subgraph keeps the parsed form for direct queries. |
| **Vault fee** | `isVaultAdmin` | `Vault.feePercent` (basis points) and the `feeRecipient` chain. If a `RewardSplitter` is wired (`feeRecipient = splitter address`), this tab edits the splitter's per-beneficiary shares (`RewardSplitterShareHolder.shares`) and supports adding/removing beneficiaries — the splitter contract handles the on-chain distribution. |
| **Roles** | `isVaultAdmin` | `Vault.validatorsManager`, plus (post-Pectra and only when a v3+ `RewardSplitter` is configured) the `feeClaimer` permission on that splitter. Whitelister / blocklist manager rotation is also here when the vault has `isPrivate: true` / `isBlocklist: true`. |
| **Deposit data file** | `isDepositDataManager && isNativeValidatorsManager` | `Vault.depositDataRoot` and `depositDataManager` — uploads a new deposit-data file (validator pubkeys + signatures). Separate role; a depositDataManager who isn't the admin sees ONLY this tab. |

### Validators panel — backend `vaultValidators`

The vault page shows "Validators" with either "Vault has no validators" (`Vault.isCollateralized: false` + backend `vaultValidators: []`) or a table sourced from the backend.

Verified field shape (introspected against `mainnet-api.stakewise.io` 2026-05-12):

```graphql
type VaultValidatorQL {
  publicKey: String!     # 48-byte BLS pubkey, hex like "0xaa8ac29c6cf5..."
  apr: Decimal!          # PERCENT already (e.g. "2.22" = 2.22%), same scale as Vault.apy
  income: Wei!           # lifetime income, wei (string)
  earned: BigInt!        # same value as `income` — duplicate field, prefer `income` (Wei has stricter typing)
  createdAt: DateTime!   # ISO 8601 string with timezone, e.g. "2025-12-28T09:03:23+00:00" — NOT Unix seconds
  status: String!        # beacon chain status: "active_ongoing", "pending_queued", "pending_initialized", "active_exiting", "active_slashed", "exited_unslashed", "exited_slashed", "withdrawal_possible", "withdrawal_done"
}
```

**⚠️ Two units to remember**:
- `createdAt` is an ISO 8601 string, NOT a BigInt Unix timestamp like subgraph timestamps. Parse with `new Date(createdAt)`.
- `apr` is already in percent (same scale as `Vault.apy`). Do not multiply by 100.

Query arguments:
- `vaultAddress: String!` (required, lowercase)
- `first: Int` (defaults reasonable, max ≈ 1000 — verified by sending 1000 and getting 1000 back)
- `skip: Int`
- `statusIn: [String]` and `statusNotIn: [String]` — exclude `"withdrawal_done"` to skip historical validators.

```graphql
{
  vaultValidators(
    vaultAddress: "0xac0f906e433d58fa868f936e8a43230473652885"
    first: 100
    skip: 0
    statusNotIn: ["withdrawal_done"]
  ) {
    publicKey apr income createdAt status
  }
}
```

### Verified validator stats — Mainnet Genesis, 2026-05-12

| Metric | Value |
|---|---|
| Total active validators | ~3,764 (4 pages: 1000+1000+1000+764) |
| APR min / avg / max (sample 1000) | 2.17% / 2.74% / **33.99%** |
| Lifetime income avg per validator | ~1.04 ETH |
| Lifetime income page 1 sum | 1,037.76 ETH |

**⚠️ APR outliers**: a newly-registered validator may report a wildly high APR (we saw 33.99%) because the income-vs-time ratio is unstable in the first few days. When formatting, surface the median or trim to interquartile range rather than max/avg if the user asks for "typical APR".

For "how many validators is the vault running?" count via pagination (`first: 1000`, increment `skip` until result length < `first`). For a binary answer, `Vault.isCollateralized` from subgraph is enough.

### Name lookup hint

If the user gave an operator **name** ("Chorus One", "P2P", "MetaMask") — operator names aren't a field; instead either:
1. Search `vaults(where: { displayName_contains_nocase: "chorus" })` and pick the unique `admin` addresses from the result.
2. Or tell the user you don't have a name→admin mapping and ask for the admin address.

---

## 18. "What's my osToken exit queue status?"

Separate from the vault exit queue (recipe 3). When a user redeems osETH/osGNO back to ETH/GNO via the osToken redemption queue, the entry lives in `OsTokenExitRequest`, not `ExitRequest`.

Endpoint: **subgraph**

```graphql
{
  osTokenExitRequests(
    where: { owner: "<USER>" }
    orderBy: positionTicket
    orderDirection: desc
    first: 20
  ) {
    positionTicket
    osTokenShares
    exitedAssets
    ltv
    vault { id displayName }
  }
}
```

Format:
- `osTokenShares / 1e18` — osETH being redeemed
- `exitedAssets / 1e18` (when non-null) — assets received
- If `exitedAssets` is null → still queued.
- `ltv` is the LTV of the position at the time the redemption was created.

Always pair the answer with recipe 3 if the user also has vault-side exit requests — these are two separate queues, surface both.

---

## 19. "Am I a beneficiary of any reward splitter? How much have I earned through splitters?"

Reward splitters are contracts that distribute a vault's fee revenue between multiple beneficiaries (e.g. operator + DAO + LST partner). A user's address can be a `RewardSplitterShareHolder` of one or more splitters.

Endpoint: **subgraph**

```graphql
{
  rewardSplitterShareHolders(
    where: { address: "<USER>", shares_gt: "0" }
    first: 100
  ) {
    shares
    earnedVaultShares
    earnedVaultAssets
    rewardSplitter {
      id
      totalShares
      vault { id displayName apy }
    }
  }
}
```

Format (per splitter):
- Your share: `shares / totalShares * 100` → percent of fees you receive
- Earned: `earnedVaultAssets / 1e18` → assets you've earned via this splitter (multiply by `assetsUsdRate` for USD)
- Vault: name + current APY for context
- If `shares` is non-zero but `earnedVaultAssets` is zero → splitter exists but hasn't accumulated fees yet.

Empty result → "you're not a beneficiary of any reward splitter on this network".

---

## Optional follow-ups (not full Q&A, mentioned as hints)

### A. Active incentive campaigns
```graphql
{
  periodicDistributions(where: { startTimestamp_lte: <NOW>, endTimestamp_gt: <NOW> }) {
    distributionType data token amount apy startTimestamp endTimestamp
  }
}
```
`distributionType` values: `VAULT`, `SWISE_ASSET_UNI_POOL`, `OS_TOKEN_USDC_UNI_POOL`, `LEVERAGE_STRATEGY`, `UNKNOWN`. `data` is the entity address tied to the type (vault address for `VAULT`; pool address for the Uniswap variants; strategy address for `LEVERAGE_STRATEGY`).

### B. Cross-network user aggregate
Fire 3 parallel POSTs (Mainnet + Gnosis + Hoodi), each running recipe 2 with the same `<USER>`. Sum `assets`, `totalEarnedAssets` after converting via per-chain `assetsUsdRate` to USD.

### C. Validators of a vault (NOT subgraph — backend GraphQL)
```graphql
# POST to https://mainnet-api.stakewise.io/graphql
{
  vaultValidators(vaultAddress: "<VAULT>", skip: 0, first: 20, statusNotIn: ["withdrawal_done"]) {
    publicKey
    apy: apr
    income
    createdAt
  }
}
```

### D. Indexing lag check
```graphql
{ checkpoints(first: 1, orderBy: timestamp, orderDirection: desc) { timestamp } }
```
Show user `now - timestamp` in seconds if they suspect stale data.

### E. Detailed snapshot grain for vault APY history
Same as recipe 6 but on `vaultSnapshots(where: { vault: "<VAULT>" }, ...)`. Full recipe is now §16 above.

### F. Aave pool-wide stats (leverage strategy backend)
```graphql
{ aaves(first: 1) { borrowApy supplyApy leverageMaxBorrowLtvPercent osTokenSupplyCap osTokenTotalSupplied } }
```
Mainnet + Hoodi only. Use when the user asks "what's the current Aave borrow rate" or "is there capacity left for boost".

### G. Token transfer history (osETH/SWISE moves for an address)
```graphql
{
  tokenTransfers(where: { from: "<USER>" }, orderBy: timestamp, orderDirection: desc, first: 50) { hash amount tokenSymbol from to timestamp }
  tokenTransfersIn: tokenTransfers(where: { to: "<USER>" }, orderBy: timestamp, orderDirection: desc, first: 50) { hash amount tokenSymbol from to timestamp }
}
```
Filter by `tokenSymbol: "osETH"` etc. for a specific token.

### H. Is this address a contract or an EOA?
```graphql
{ userIsContracts(where: { id: "<USER>" }) { isContract } }
```
Useful when explaining why a position belongs to a multisig / Safe instead of an EOA.

### I. V2 legacy position
```graphql
{ v2PoolUsers(where: { id: "<USER>" }) { balance } }
```
Only relevant if the user staked before V3 migration and never moved their position.

### J. Validator by public key
```graphql
{ networkValidators(where: { id: "<PUBKEY>" }) { id } }
```
Subgraph only stores pubkey registry; for status/APR use backend (`vaultValidators`, follow-up C).

### K. "How much did I earn yesterday?"
Recipe 6 with `timestamp_gte: now - 86400`, take the most recent `AllocatorSnapshot.earnedAssets`.

### L. "Why is my effective APY different from the vault APY?"
Compare `Allocator.apy` (your effective) to `Allocator.vault.apy` (vault). Delta typically comes from: (a) osToken minted → mint fee reduces effective yield, (b) boost active → adds yield, (c) snapshot vs current — `Allocator.apy` is the weekly-averaged user APY, the vault APY is also weekly-averaged but for the whole vault. Surface the three causes in the answer.

### M. Operator fee revenue from a vault over time
Vault revenue isn't a directly indexed quantity, but you can derive it. For the simple case where the operator is also the `feeRecipient`:
- Fee rate: `Vault.feePercent / 10000` (basis points → fraction)
- Vault rewards over period: sum `VaultSnapshot.earnedAssets` (wei) with `timestamp_gte/timestamp_lte` (recipe 16)
- Operator revenue ≈ `sum(earnedAssets) × feePercent / 10000`

If a `RewardSplitter` is configured (recipe 19), the operator's actual share is `RewardSplitterShareHolder.earnedVaultAssets` (already wei-denominated, no extra math needed). Pick the right path:
- `Vault.feeRecipient == operator address` AND no splitter → use the formula above
- A splitter contract sits between vault and operator → use the splitter share holder field

For "fees earned today / this week / this month" compose: a `vaultSnapshots` window query + the splitter share holders query if applicable.

### N. osETH global supply, total assets, dilution trend
```graphql
{ osTokens(first: 1) { apy apys feePercent totalSupply totalAssets } }
```
- `totalSupply` / 1e18 → osETH outstanding
- `totalAssets` / 1e18 → underlying ETH/GNO backing
- Ratio `totalAssets / totalSupply` ≈ current osTokenAssetsRate (single network).
- `apys` array is recent APY history at coarse cadence — use `exchangeRateStats_collection` (recipe 6 / §5 in entities.md) for proper daily series.

### O. osETH transfers for an address
Recipe shape in §17 of `entities.md`. Use cases: "where did this 5 osETH come from", "who do I usually send osETH to". Combine with recipe 10 (merkle claims) and `OsTokenHolder.transfersCount` for total movement counter.

### P. Is this vault blacklisted / hidden / verified on the backend?
Subgraph doesn't track this. UI uses backend `vaults(id)` to gate `/vault/<network>/<addr>` access.

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ vaults(id:\"<VAULT>\") { id blacklisted hidden verified mevMissed avgExitQueueLength ogImageUrl } }"}' \
  https://mainnet-api.stakewise.io/graphql
```

- `blacklisted: true` → UI redirects detail page (e.g. `0x4fef9d...` on Mainnet)
- `hidden: true` → vault not shown in marketplace list
- `verified: true` → UI shows a verified badge
- `mevMissed` → wei value of MEV the vault's validators didn't capture
- `avgExitQueueLength` → seconds, **the real exit queue ETA source** for recipe 3 fallback

### Q. Why is this vault rated Excellent / Moderate / Bad? (score breakdown)
Backend explains. Useful when the user asks "what's wrong with this vault — why Moderate?".

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ scoringDetails(vaultAddress:\"<VAULT>\") { __typename } }"}' \
  https://mainnet-api.stakewise.io/graphql
```

(Probe the actual field set on `ScoringDetailsQL` via `__type(name:"ScoringDetailsQL")` introspection when implementing.)

### R. Global exit queue statistics
```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ exitStats { __typename } }"}' \
  https://mainnet-api.stakewise.io/graphql
```

Use when user asks about network-wide exit pressure.

### S. OFAC compliance check
```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ ofacAddresses }"}' \
  https://mainnet-api.stakewise.io/graphql
```

UI blocks wallet connect for sanctioned addresses. Skill answers a "why won't the app let me connect with my wallet" question — does NOT enable bypass.
