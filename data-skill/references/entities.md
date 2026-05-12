---
title: Subgraph entities — by use case
description: A schema digest of the StakeWise V3 subgraph, grouped by what users ask. Each entity lists its filterable fields, with units, lowercase rules, and the canonical query shape.
---

# Subgraph entities — by use case

Canonical schema: `schema-snapshot.graphql` in this same directory. This file is the human-readable index; treat it as authoritative for the **public** read use cases.

Format of each row: `fieldName: Type` followed by a one-line note (unit, derived flag, lowercase requirement, etc.).

---

## 1. Vault state — basic vault info, APY, capacity

Entity: **`Vault`** — id is the vault address (lowercase). Filter by `id:` or `where: { id: "0x..." }`.

Identity and metadata:
- `id: ID!` — vault address, lowercase hex
- `address: Bytes!` — same as `id`
- `addressString: String!` — case-preserving copy for full-text search
- `displayName: String` — human name from IPFS metadata (null if not set)
- `description: String`
- `imageUrl: String`
- `tokenName: String` — null for non-ERC20 vaults
- `tokenSymbol: String` — null for non-ERC20 vaults
- `metadataIpfsHash: String`
- `metadataUpdatedAt: BigInt` — Unix seconds
- `createdAt: BigInt!` — Unix seconds
- `version: BigInt!` — vault contract version (1, 2, 3, 4, ...)

Performance and economics:
- `apy: BigDecimal!` — current weekly-averaged annual APY, **already in percent** (e.g. `"2.71"` = 2.71%; do NOT multiply by 100)
- `baseApy: BigDecimal!` — staking-only portion
- `extraApy: BigDecimal!` — incentive distributions portion
- `allocatorMaxBoostApy: BigDecimal!` — max additional APY available via boost (Mainnet/Hoodi only)
- `feePercent: Int!` — basis points (1000 = 10%)
- `lastFeePercent: Int` — previous fee bps
- `lastFeeUpdateTimestamp: BigInt`
- `score: BigDecimal!` — backend-managed performance score, **0–100 percent already** (e.g. `"99.65"` = 99.65%, NOT 0.9965). Verified against the UI: `99.65` → "Excellent", `97.86` → "Moderate". Older code may reference `performance` — that field does NOT exist in the current schema

Capacity and accounting (all wei):
- `totalAssets: BigInt!` — TVL in wei
- `totalShares: BigInt!`
- `capacity: BigInt!` — max accepted assets in wei
- `queuedShares: BigInt!` — exit queue depth (in shares)
- `exitingAssets: BigInt!` — V2-style exiting assets
- `exitingTickets: BigInt!` — V2 queue ticket count
- `rate: BigInt!` — assets per 1e18 shares

Flags (booleans):
- `isPrivate: Boolean!` — whitelist-only
- `isBlocklist: Boolean!`
- `isErc20: Boolean!` — has share-token ERC20
- `isOsTokenEnabled: Boolean!`
- `isMetaVault: Boolean!`
- `isCollateralized: Boolean!` — has at least one registered validator
- `isGenesis: Boolean!` — migrated from V2 pool
- `canHarvest: Boolean!`

Addresses:
- `factory: Bytes!`
- `admin: Bytes!`
- `feeRecipient: Bytes!`
- `mevEscrow: Bytes` — **null = smoothing pool (shared MEV)**; non-null = vault's own escrow
- `validatorsManager: Bytes`
- `depositDataManager: Bytes!`
- `whitelister: Bytes`
- `blocklistManager: Bytes`

Meta vaults:
- `subVaults: [SubVault!]!` (derived — only present when `isMetaVault: true`). See section 9 for the SubVault entity. To find the **parent** meta-vault of a vault, use `subVaults(where: { subVault: "0x..." }) { metaVault { id } }` (reverse lookup) — the Vault entity itself does NOT have a `parentMetaVaults` field on prod.

Rewards harvest state:
- `consensusReward: BigInt!`
- `lockedExecutionReward: BigInt!`
- `unlockedExecutionReward: BigInt!`
- `slashedMevReward: BigInt!`
- `rewardsRoot: Bytes`
- `rewardsTimestamp: BigInt`
- `rewardsIpfsHash: String`
- `proofReward: BigInt`
- `proofUnlockedMevReward: BigInt`
- `proof: [String!]`

Counters:
- `blocklistCount: BigInt!`
- `whitelistCount: BigInt!`

Derived (reverse lookups):
- `allocators: [Allocator!]!`
- `allocatorActions: [AllocatorAction!]!`
- `exitRequests: [ExitRequest!]!`
- `osTokenExitRequests: [OsTokenExitRequest!]!`
- `rewardSplitters: [RewardSplitter!]!`
- `leveragePositions: [LeverageStrategyPosition!]!`

Composite/embedded:
- `osTokenConfig: OsTokenConfig!` — see section 4

**Common filters**:
```graphql
vaults(where: { id: "0x..." })
vaults(where: { isPrivate: false, isCollateralized: true, isOsTokenEnabled: true })
vaults(orderBy: totalAssets, orderDirection: desc, first: 10)
vaults(orderBy: apy, orderDirection: desc, first: 20, where: { feePercent_lt: 1000 })
```

---

## 2. Your position — Allocator + ExitRequest + OsTokenHolder

### `Allocator` — user's position in a single vault

- `id: ID!` — `<vault>-<address>` (both lowercase)
- `address: Bytes!` — allocator address
- `vault: Vault!`
- `shares: BigInt!` — vault shares (wei)
- `assets: BigInt!` — assets value (wei) — what the user "has staked"
- `exitingAssets: BigInt!` — assets currently in exit queue
- `mintedOsTokenShares: BigInt!` — osETH/osGNO minted against this position
- `ltv: BigDecimal!` — current LTV percent (string decimal)
- `ltvStatus: LtvStatus!` — `Healthy | Moderate | Risky | Unhealthy`
- `apy: BigDecimal!` — user's effective weekly APY (decimal)
- `totalEarnedAssets: BigInt!` — lifetime rewards in wei
- `totalStakeEarnedAssets: BigInt!` — staking portion
- `totalBoostEarnedAssets: BigInt!` — boost portion
- `exitRequests: [ExitRequest!]!` — derived

**Common filters**:
```graphql
allocators(where: { address: "0x...", vault: "0x..." })
allocators(where: { address: "0x..." })  # all user positions
allocators(where: { address: "0x...", mintedOsTokenShares_gt: "0" })  # only positions with osToken
```

### `OsTokenHolder` — osToken balance for an address

- `id: ID!` — holder address (lowercase)
- `balance: BigInt!` — total osToken shares held
- `transfersCount: BigInt!`

```graphql
osTokenHolders(where: { id: "0x..." })
```

### `ExitRequest` — vault unstake queue entries

- `id: ID!` — `<vault>-<positionTicket>`
- `positionTicket: BigInt!`
- `isV2Position: Boolean!`
- `owner: Bytes!`
- `receiver: Bytes!` — may differ from owner
- `allocator: Allocator!`
- `vault: Vault!`
- `totalTickets: BigInt!`
- `totalAssets: BigInt!` — queued assets in wei
- `exitedAssets: BigInt!` — already withdrawable in wei
- `exitQueueIndex: BigInt` — null until claimable
- `timestamp: BigInt!` — Unix seconds when queued
- `withdrawalTimestamp: BigInt` — backend-estimated ETA, Unix seconds, nullable
- `isClaimable: Boolean!` — ready to withdraw
- `isClaimed: Boolean!` — withdrawn already

**Common filters**:
```graphql
exitRequests(where: { owner: "0x...", isClaimed: false })
exitRequests(where: { vault: "0x...", owner: "0x..." })
exitRequests(where: { receiver: "0x...", isClaimable: true })
```

### `OsTokenExitRequest` — osToken redemption queue

- `id: ID!` — `<vault>-<positionTicket>`
- `owner: Bytes!`
- `vault: Vault!`
- `positionTicket: BigInt!`
- `exitedAssets: BigInt` — nullable until processed
- `osTokenShares: BigInt!`
- `ltv: BigDecimal!` — at time of request

---

## 3. Action history — AllocatorAction

Entity: **`AllocatorAction`** — a transaction log entry per user per vault.

- `id: ID!` — `<tx-hash>-<log-index>`
- `hash: Bytes!` — tx hash
- `vault: Vault!`
- `address: Bytes!` — actor
- `actionType: AllocatorActionType!` — enum (see below)
- `assets: BigInt` — nullable
- `shares: BigInt` — nullable
- `createdAt: BigInt!` — Unix seconds

`AllocatorActionType` enum values (observed):
- `VaultCreated`
- `Deposited`
- `Redeemed`
- `TransferIn` / `TransferOut`
- `ExitQueueEntered`
- `ExitedAssetsClaimed`
- `OsTokenMinted`
- `OsTokenBurned`
- `OsTokenRedeemed`
- `OsTokenLiquidated`
- `BoostDeposited` / `BoostExitQueueEntered` / `BoostExitedAssetsClaimed`
- `Migrated`

Canonical list verified against `schema-snapshot.graphql` enum `AllocatorActionType`.

**Common filters**:
```graphql
allocatorActions(where: { address: "0x..." }, orderBy: createdAt, orderDirection: desc, first: 50)
allocatorActions(where: { address: "0x...", actionType_in: [Deposited, Redeemed] })
allocatorActions(where: { vault: "0x...", address: "0x..." })
```

---

## 4. osToken config and rates — OsTokenConfig + OsToken global

### `OsTokenConfig` — per-vault risk parameters

- `id: ID!` — vault address
- `ltvPercent: BigInt!` — max LTV when minting; value × 1e16 = percent
- `leverageMaxMintLtvPercent: BigInt!` — leverage strategy LTV cap
- `liqThresholdPercent: BigInt!` — liquidation threshold; value × 1e16 = percent

### Global `osTokens` collection (singleton entry)

```graphql
osTokens(first: 1) { apy apys feePercent totalSupply totalAssets }
```

- `apy: BigDecimal!` — current weekly-averaged osToken yield (decimal)
- `apys: [BigDecimal!]!` — historical APY snapshots (recent first)
- `feePercent: Int!` — protocol fee on osToken (basis points)
- `totalSupply: BigInt!` — total osToken shares minted (wei)
- `totalAssets: BigInt!` — total underlying assets backing osToken (wei)

For "what's the osETH total supply" or "osETH dilution over time" — these are the right fields.

---

## 5. Time-series — snapshots and aggregates

**CRITICAL — timestamp scale:** `AllocatorSnapshot.timestamp`, `VaultSnapshot.timestamp`, and the `Timestamp` custom scalar in general are in **microseconds (Unix seconds × 1_000_000)**, not seconds. Verified on Mainnet 2026-05-12: latest Genesis vault snapshot timestamp is `1778457600000000` which decodes to `2026-05-11T00:00:00Z`. Boundary is exactly **UTC 00:00 daily**.

If you forget this and filter `timestamp_gte: 1717000000`, you'll match every snapshot ever taken (they're all >> that). Always multiply your seconds value by `1_000_000` before comparing.

### `AllocatorSnapshot` — daily snapshot per user-vault

- `id: Bytes!`
- `timestamp: Timestamp!` — **microseconds since epoch**
- `allocator: Allocator!`
- `apy: BigDecimal!` — that day's effective APY
- `ltv: BigDecimal!`
- `totalAssets: BigInt!` — end-of-day balance (wei)
- `earnedAssets: BigInt!` — that day's rewards (wei, can be negative on slashing)
- `stakeEarnedAssets: BigInt!`
- `boostEarnedAssets: BigInt!`

Filter by nested allocator + timestamp (note the `_` suffix on `allocator_` to enter the related entity):
```graphql
# 90 days of history, where nowSec is the current Unix time IN SECONDS
allocatorSnapshots(
  where: {
    allocator_: { address: "0x...", vault: "0x..." }
    timestamp_gte: "<(nowSec - 90 * 86400) * 1_000_000>"
  }
  orderBy: timestamp
  orderDirection: desc
  first: 90
) { timestamp apy earnedAssets stakeEarnedAssets boostEarnedAssets totalAssets }
```

Client-side cap: keep range ≤ 1000 days.

### `VaultSnapshot` — daily snapshot per vault

- `id: Bytes!`
- `timestamp: Timestamp!` — **microseconds**, UTC 00:00 boundary
- `vault: Vault!`
- `apy: BigDecimal!`
- `totalAssets: BigInt!`
- `totalShares: BigInt!`
- `earnedAssets: BigInt!`

### `ExchangeRateSnapshot` and `ExchangeRateStats`

`ExchangeRateSnapshot` is a periodic snapshot (~hourly) of all rates; `ExchangeRateStats` is a daily `@aggregation` of the same data with last-of-day values. Use the `_collection` (lowercase first letter) query form for aggregations.

```graphql
exchangeRateStats_collection(
  interval: day
  first: 30
  where: { timestamp_gte: "<(nowSec - 30 * 86400) * 1_000_000>" }
) {
  timestamp
  assetsUsdRate osTokenAssetsRate swiseUsdRate
  usdToEurRate usdToGbpRate usdToCnyRate usdToJpyRate usdToKrwRate usdToAudRate
}
```

---

## 6. Rates — ExchangeRate (current snapshot)

Entity: **`ExchangeRate`** — singleton (`id = "0"`), the latest known rates.

```graphql
exchangeRates(first: 1) {
  osTokenAssetsRate
  assetsUsdRate
  ethUsdRate btcUsdRate solUsdRate
  daiUsdRate usdcUsdRate
  swiseUsdRate obolUsdRate ssvUsdRate
  usdToEurRate usdToGbpRate usdToCnyRate usdToJpyRate usdToKrwRate usdToAudRate
}
```

All rates are decimal strings. `osTokenAssetsRate` = how many native assets equal 1 osToken share. Asset USD = `assetsUsdRate` (ETH on Mainnet, GNO on Gnosis).

**Gnosis fallback**: fiat fields (`usdTo*Rate`) on Gnosis are often null/zero. Fetch them from Mainnet subgraph instead. Cross-chain price is identical (USD is global).

---

## 7. Boost / leverage — LeverageStrategyPosition + Aave

Only deployed on Mainnet and Hoodi. On Gnosis these queries return empty.

### `LeverageStrategyPosition`

- `id: ID!` — `<vault>-<user>`
- `proxy: Bytes!` — user's leverage proxy contract (use this address to filter `aavePositions`, not the user's EOA)
- `user: Bytes!`
- `vault: Vault!`
- `osTokenShares: BigInt!` — osToken share count locked **in the leverage strategy contract**. NOT the user-facing Boost balance (which adds accrued reward shares — see below).
- `assets: BigInt!` — **ETH-denominated** accrued rewards in the strategy that have not yet been auto-restaked into more osToken shares. The SDK aliases this as `boostRewardAssets`. Convert to osToken-share units via `MintTokenController.convertToShares(assets)` (RPC) and add to `osTokenShares` to get the boost balance the app displays. Verified to match the UI on `0xe2008b01…` in Genesis (2,014.22 osTokenShares + 40.71 rewardShares = 2,054.93 boost balance = UI's "Boost" figure exactly).
- `borrowLtv: BigDecimal!` — current borrow LTV, **decimal ratio 0..1** (e.g. `"0.9311"` = 93.11%)
- `exitingPercent: BigInt!` — wad (1e18 = 100%)
- `exitingOsTokenShares: BigInt!`
- `exitingAssets: BigInt!`
- `exitRequest: ExitRequest` — nullable (set when an unboost is queued)
- `version: BigInt!`

**Important — "Boost" value in the UI:** app.stakewise.io's "Boost: N osETH" line is computed from `LeverageStrategyPosition`, NOT from `AavePosition`. The canonical formula (verified against SDK + UI) is:

```
boostBalanceShares = osTokenShares + MintTokenController.convertToShares(assets)
                                                                       └─ "assets" = LeverageStrategyPosition.assets (rewardAssets in ETH)
```

For `0xe2008b01…` in Genesis: 2,014.22 + 40.71 = **2,054.93 osETH** = UI's exact value. The Aave-side `suppliedOsTokenShares` / `borrowedAssets` numbers explain the strategy's mechanics (supply/borrow loop), but they do NOT appear in the user-facing Boost number. See cookbook recipe 5 for the full query and worked example.

Borrow status thresholds (compute manually):
- `borrowLtv ≤ 0.938` → Healthy
- `borrowLtv ≤ 0.945` → Moderate
- else → Risky

### `Aave` — singleton pool state

```graphql
aaves(first: 1) {
  borrowApy
  supplyApy
  leverageMaxBorrowLtvPercent
  osTokenSupplyCap
  osTokenTotalSupplied
}
```

Field formats (verified Mainnet 2026-05-12):
- `borrowApy: BigDecimal!` — **percent already**, e.g. `"2.665"` = 2.665%.
- `supplyApy: BigDecimal!` — same scale; in practice near zero for osETH (no incentives on supply side).
- `leverageMaxBorrowLtvPercent: BigInt!` — **18-decimal fixed point**, NOT basis points. Value `"929999998000000000"` ÷ 1e18 = `0.93` = 93% borrow LTV cap. Do not divide by 10000.
- `osTokenSupplyCap: BigInt!` — total osETH that can be supplied to Aave (wei).
- `osTokenTotalSupplied: BigInt!` — currently supplied (wei). `(supplied / cap)` gives current utilisation; if at 100% no new boost positions can open.

### `AavePosition` — user's borrow position

- `id: ID!` — user address (lowercase)
- `user: Bytes!`
- `aave: Aave!`
- `suppliedOsTokenShares: BigInt!`
- `borrowedAssets: BigInt!`

**Note**: When the user's `LeverageStrategyPosition.proxy` is what to filter `AavePosition.user` by (the proxy holds the Aave debt, not the EOA).

---

## 8. Distributor — merkle rewards and incentive campaigns

### `DistributorClaim` — unclaimed merkle rewards per user

- `id: ID!` — user address (lowercase)
- `user: Bytes!`
- `tokens: [Bytes!]!` — reward token addresses (parallel array)
- `cumulativeAmounts: [BigInt!]!` — cumulative per token in wei (parallel to `tokens`)
- `unclaimedAmounts: [BigInt!]!` — what's still claimable (parallel to `tokens`)
- `proof: [String!]!` — merkle proof for on-chain claim

The three arrays are zipped — `tokens[i]`, `cumulativeAmounts[i]`, `unclaimedAmounts[i]` belong together. Empty arrays = nothing to claim.

```graphql
distributorClaims(where: { user: "0x..." }) { tokens cumulativeAmounts unclaimedAmounts proof }
# Filter by id for a known user:
distributorClaims(id: "0x...") { tokens cumulativeAmounts unclaimedAmounts proof }
```

### `Distributor` — global state

- `id: ID!` — singleton (`"0"`)
- `activeDistributionIds: [String!]!` — current campaign IDs
- `activeDistributors: [Bytes!]!` — addresses of distribution contracts

Rarely queried directly; usually you go through `DistributorClaim` or `PeriodicDistribution`.

### `DistributorReward` — cumulative tracker per token-user

- `id: ID!` — `<token>-<user>`
- `user: Bytes!`
- `token: Bytes!`
- `cumulativeAmount: BigInt!`

### `PeriodicDistribution` — active and historical incentive campaigns

- `id: ID!`
- `hash: Bytes!`
- `distributionType: DistributionType!` — `VAULT | SWISE_ASSET_UNI_POOL | OS_TOKEN_USDC_UNI_POOL | LEVERAGE_STRATEGY | UNKNOWN`
- `data: Bytes!` — extra identifier (e.g. vault address for VAULT type)
- `token: Bytes!` — reward token
- `amount: BigInt!` — total reward in wei
- `apy: BigDecimal!` — incentive APY (decimal)
- `startTimestamp: BigInt!`
- `endTimestamp: BigInt!`

**Active campaigns**:
```graphql
periodicDistributions(where: { startTimestamp_lte: 1717000000, endTimestamp_gt: 1717000000 }) {
  distributionType data token amount apy startTimestamp endTimestamp
}
```

### `RewardSplitter` + `RewardSplitterShareHolder`

`RewardSplitter` — a contract that splits a vault's fee proceeds between named beneficiaries. The vault's `feeRecipient` points at the splitter; the splitter distributes by share weight.

- `RewardSplitter.id: ID!` — splitter contract address (lowercase)
- `RewardSplitter.version: BigInt!` — splitter contract version
- `RewardSplitter.owner: Bytes!` — admin who can change beneficiaries
- `RewardSplitter.claimer: Bytes` — optional auto-claimer permission (nullable)
- `RewardSplitter.totalShares: BigInt!` — sum of all beneficiary shares (always `100e18` in practice)
- `RewardSplitter.vault: Vault!`
- `RewardSplitter.shareHolders: [RewardSplitterShareHolder!]!`

`RewardSplitterShareHolder` — one beneficiary entry on a splitter.

- `id: ID!` — `<splitterAddress>-<holderAddress>`
- `rewardSplitter: RewardSplitter!`
- `vault: Vault!`
- `address: Bytes!` — beneficiary EOA (lowercase)
- `shares: BigInt!` — beneficiary's share count (out of `totalShares`)
- `earnedVaultShares: BigInt!` — accumulated vault shares earned via this allocation
- `earnedVaultAssets: BigInt!` — same in asset terms

```graphql
rewardSplitters(where: { vault: "0x..." }) {
  id owner claimer totalShares
  shareHolders { address shares earnedVaultShares earnedVaultAssets }
}

# Find all splitter positions for a beneficiary:
rewardSplitterShareHolders(where: { address: "0x..." }) {
  shares earnedVaultAssets
  rewardSplitter { id totalShares vault { id displayName } }
}
```

---

## 9. Meta vaults — SubVault

Entity: **`SubVault`** — links a meta-vault to one of its child vaults.

- `id: ID!` — `<metaVault>-<subVault>`
- `metaVault: Vault!` — the parent (a Vault object you can `{ id displayName ... }` into)
- `subVault: Bytes!` — the child vault address as a raw bytes string (**not a Vault object!**)

**Important gotcha:** because `subVault` is a `Bytes` scalar (not an object reference), you cannot nest `{ id displayName apy ... }` inside it. To fetch sub-vault details you do **two queries** (or aliased queries in one round-trip): first get the sub-vault addresses from `subVaults`, then fetch each `vault(id: "<addr>")`.

Two directions:
- **Get sub-vaults of a meta-vault** — filter `subVaults(where: { metaVault: "0x..." })` and read each `subVault` address.
- **Get parent meta-vault of a sub-vault** — reverse lookup: `subVaults(where: { subVault: "0x..." }) { metaVault { id displayName } }`. There is no `Vault.parentMetaVaults` field on prod.

```graphql
# Step 1 — list sub-vault addresses of a meta-vault, plus what the meta-vault holds inside each
{
  meta: vault(id: "0xMETA_ADDR") {
    id displayName totalAssets apy
    subVaults {
      subVault
    }
  }
}

# Step 2 — fetch sub-vault details (one query per sub, or batched as below with aliases)
{
  sub0: vault(id: "0xSUB0_ADDR") { id displayName apy totalAssets feePercent isCollateralized }
  sub1: vault(id: "0xSUB1_ADDR") { id displayName apy totalAssets feePercent isCollateralized }
}

# Step 3 (optional) — what the meta-vault holds inside each sub (filter allocators by meta's address)
{
  allocators(where: { vault_in: ["0xSUB0", "0xSUB1"], address: "0xMETA_ADDR" }) {
    vault { id displayName }
    assets shares apy totalEarnedAssets
  }
}
```

---

## 10. Whitelist and blocklist

Two separate entities — their names do NOT match the natural "whitelist" / "blocklist" words. Always use the canonical names below.

- `PrivateVaultAccount` (entity) → `privateVaultAccounts(...)` (query). Addresses approved to stake in a private vault.
- `VaultBlockedAccount` (entity) → `vaultBlockedAccounts(...)` (query). Addresses blocked from a vault.

Shared shape:
- `id: ID!` — composite `<vault>-<address>`
- `address: Bytes!`
- `vault: Vault!`
- `createdAt: BigInt!` — Unix seconds

```graphql
privateVaultAccounts(where: { vault: "0x...", address: "0x..." }) { id createdAt }
# If non-empty → the user is whitelisted.

privateVaultAccounts(where: { vault: "0x..." }, first: 50) { address createdAt }
# All whitelisted addresses (paginated).

vaultBlockedAccounts(where: { vault: "0x..." }, first: 50) { address createdAt }
```

Always check `Vault.isPrivate` / `Vault.isBlocklist` first to know whether these lists are relevant.

---

## 11. Vesting — VestingEscrow

Entity: **`VestingEscrow`** — the subgraph stores only identity. Amounts and schedule live on-chain.

- `id: ID!` — escrow proxy contract address (lowercase)
- `token: String!` — the **ERC20 token address** (lowercase hex; despite the field name being `String`, it's an address — e.g. `"0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2"` for SWISE)
- `recipient: Bytes!` — beneficiary EOA

To answer "what can I claim from my vesting?" you do two steps:

1. **Subgraph** — `vestingEscrows(where: { recipient: "0x..." })` returns the user's escrow addresses (could be multiple). For each escrow:
2. **RPC eth_call** to the escrow contract (each escrow is an EIP-1167 proxy of `0x1e6d872ce26c8711e7d47b8e0c47ab91d95a6df3` on Mainnet). The implementation exposes:
   - `unclaimedAmount() → uint256` — **already computed for you**, this is the answer.
   - `totalAmount() → uint256` — grant size.
   - `vestedAmount() → uint256` — how much has vested so far.
   - `claimedAmount() → uint256` — how much already withdrawn.
   - `startTime() / endTime() → uint256` Unix seconds — vesting window.
   - `cliffLength() → uint256` seconds — relative offset from start; until `start + cliffLength` no tokens vest.
   - `paused() → bool` — if true, claiming is disabled.

See `rpc-fallback.md` § VestingEscrow for the exact selectors and a live worked example.

Do **not** compute claimable yourself with `total × (now − start) / (end − start) − claimed` — the contract handles cliff and pause logic correctly; trust `unclaimedAmount()`.

---

## 12. Network-wide stats — Network

Entity: **`Network`** — singleton per chain (`id` is always `"0"`).

```graphql
networks(first: 1) {
  usersCount
  vaultsCount
  totalAssets
  totalEarnedAssets
}
```

Fields **confirmed deployed on prod subgraph** (Mainnet / Gnosis / Hoodi):
- `id: ID!` — always `"0"`
- `factoriesInitialized: Boolean!`
- `totalAssets: BigInt!` — total staked in wei across all vaults of this chain
- `totalEarnedAssets: BigInt!` — total network rewards in wei
- `vaultsCount: Int!` — all vaults
- `vaultIds: [String!]!` — every vault address (string form)
- `osTokenVaultIds: [String!]!` — subset used in osToken rate calculation
- `oraclesConfigIpfsHash: String!`
- `usersCount: Int!` — unique allocators plus osToken holders

Fields **in the source schema (`schema-snapshot.graphql`) but not yet deployed to prod** (verified via introspection 2026-05-12 against `stakewise/v3-subgraph@fc2a4ab4…`):
- `Network.collateralizedVaultsCount: Int!` — declared upstream but prod returns `Type 'Network' has no field 'collateralizedVaultsCount'`.
- `Vault.subVaultsCount: Int!` — declared upstream but prod returns `Type 'Vault' has no field 'subVaultsCount'`. Use `subVaults { subVault }` and count client-side.
- `SubVault.subVault: Vault!` — upstream declares it as a Vault object reference, but prod returns it as `Bytes!` (the address as a scalar). Do not try `subVault { id displayName … }`; use the two-step pattern in section 9 instead.

When prod catches up on any of these, the daily `verify-queries.yml` workflow will start passing the previously-failing probes — that's the trigger to update entities.md and remove the field from this list.

For "total across all StakeWise" you fire one query per chain in parallel and sum.

---

## 13. Sync / lag detection — Checkpoint

Entity: **`Checkpoint`**

- `id: Bytes!`
- `timestamp: BigInt!` — Unix seconds of last sync

```graphql
checkpoints(first: 1, orderBy: timestamp, orderDirection: desc) { timestamp }
```

If `(now - timestamp) > 30` seconds, the subgraph is lagging — surface this.

---

## 14. Validators — NetworkValidator (registry only)

Entity: **`NetworkValidator`** — public key registry only.

- `id: Bytes!` — validator public key

For APR, income, status of validators of a specific vault → use the **backend GraphQL** `vaultValidators(vaultAddress, skip, first, statusNotIn)`. See `endpoints.md` for the URL.

---

## 15. Legacy V2 — V2Pool + V2PoolUser

V2 entities kept for migration only. Skip unless explicitly asked.

- `V2Pool` — singleton; `apy`, `totalAssets`, `rate`, `migrated`, `isDisconnected`.
- `V2PoolUser.id` = user address; `balance` = V2 pool token balance.

---

## 16. Address type — UserIsContract

Quick check whether an address is an EOA or a contract.

- `id: Bytes!` — address (lowercase)
- `isContract: Boolean!`

```graphql
userIsContracts(where: { id: "0x..." }) { isContract }
```

Useful when explaining a position to a user who pasted a multisig address.

---

## 17. Token transfers — TokenTransfer

osETH / osGNO / SWISE ERC20 transfer log. Use when the user asks "show my osETH movements" or "where did this osETH come from".

- `id: ID!` — `<tx-hash>-<log-index>`
- `hash: Bytes!` — transaction hash
- `amount: BigInt!` — transferred amount (wei)
- `tokenSymbol: String!` — `"osETH"`, `"osGNO"`, `"SWISE"`, etc.
- `from: Bytes!` — sender (lowercase)
- `to: Bytes!` — recipient (lowercase)
- `timestamp: BigInt!` — Unix seconds

```graphql
tokenTransfers(where: { tokenSymbol: "osETH", from: "0x..." }, orderBy: timestamp, orderDirection: desc, first: 50) {
  hash amount from to timestamp
}
```

For inbound transfers, swap `from` → `to`.

---

## 18. Uniswap V3 — UniswapPool + UniswapPosition

Pools where StakeWise tokens are LP'd (e.g. SWISE/ETH, osETH/ETH).

**UniswapPool**:
- `id: ID!` — pool contract address (lowercase)
- `token0: Bytes!`, `token1: Bytes!` — pair tokens
- `feeTier: BigInt!` — 500 (0.05%), 3000 (0.3%), 10000 (1%)
- `sqrtPrice: BigInt!` — current √price (Q64.96)
- `tick: Int` — current tick
- `positions: [UniswapPosition!]!` — derived

**UniswapPosition**:
- `id: ID!` — NFT tokenId
- `owner: Bytes!`
- `pool: UniswapPool!`
- `amount0: BigInt!`, `amount1: BigInt!` — token amounts (wei)
- `tickLower: Int!`, `tickUpper: Int!` — range bounds
- `liquidity: BigInt!`

```graphql
uniswapPositions(where: { owner: "0x..." }) { id pool { id token0 token1 feeTier } amount0 amount1 liquidity }
```

Only relevant when user asks about their LP positions on StakeWise-pair Uniswap pools.

---

## Things you'll want from contracts (not subgraph)

These need `eth_call` via public RPC — see `rpc-fallback.md`:

- osToken shares ↔ assets conversion: `MintTokenController.convertToAssets(shares)` / `convertToShares(assets)`
- Current osToken rate (1 share → N assets): same contract
- Vesting unlock schedule: per-escrow contract calls
- Live vault `getReceiver(positionTicket)` for exit-queue corner cases

Schema source of truth: `schema-snapshot.graphql` in this directory, pinned at `stakewise/v3-subgraph@fc2a4ab4d21ce41199783e6a432fc063a6ceabf1` (2026-05-12, `main` branch). For the three known upstream-vs-prod divergences (`Vault.subVaultsCount`, `Network.collateralizedVaultsCount`, `SubVault.subVault` type), see section 12 above.
