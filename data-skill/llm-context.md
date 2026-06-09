---
name: stakewise-data-query
description: Use when the user asks a natural-language question (in any language) about StakeWise V3 staking data — APY, vault TVL, their stake or earnings, exit-queue ETA, osETH/osGNO mint capacity or health factor, boost position, leverage borrow LTV, distributor (merkle) claims, vesting positions, transaction history, exchange rates, or sub-vaults. Read-only. Talks to the public StakeWise subgraphs and backend GraphQL on Mainnet and Gnosis via WebFetch / curl. No SDK install or local server required. Always answer in the user's language. Skip when @stakewise/v3-sdk is imported in the project — that's a developer use case handled by a sibling skill.
metadata:
  version: "0.1.0"
---

# StakeWise data-query skill

Answer questions about StakeWise V3 by hitting public read endpoints directly. No SDK, no local server, no auth.

**Flow.** User question → identify data domain → consult the matching entity reference → build GraphQL → WebFetch (parallel where possible) → parse → respond in user's language.

**Language.** Respond in the same language the user wrote in. Field names, GraphQL keywords, URLs, and `0x` addresses stay in their original form — only the prose around them is translated.

## Execution rules — apply unconditionally

1. **Trust this skill.** When a rule applies, follow it directly. Do not re-derive the answer by introspecting unrelated entities or scanning extra sections for confirmation.
2. **Consult each section at most once per turn.** Prior consults are authoritative; do not revisit mid-answer.
3. **Decide once.** Network, time range, filter — pick at the start of the turn and execute. Do not re-evaluate the same decision after a result.
4. **Batch independent fetches.** Cross-network aggregates and multi-entity composites fire in parallel, not sequentially.
5. **Don't poll in one turn.** Soft rate limit ~1 query/sec; typical question = 1–3 queries. If subgraph lag is suspected, surface it via `Checkpoint` once and let the user decide whether to retry.

## Decision tree

1. **Inputs needed before any query:**
   - **User's 0x address** for user-specific queries (balance, earnings, exit queue, osETH health, boost, claims, vesting, transaction history, whitelist check). If missing, ask the user in their language — never guess. Vault-only queries (APY, TVL, exchange rates, network stats) don't need an address.
   - **Vault address** only for single-vault questions. For "show my positions" drop the vault filter.
   - **Vault by name** ("Genesis Vault"): resolve via `vaults(where: { displayName_contains_nocase: "<name>" }, first: 5)`. None → suggest the other network or check spelling. Many → list candidates.
   - **Time range** for history: default 30 days, mention it. Cap 365 days; hard cap 1000 days on snapshot entities.
   - **Discovery filter** ("top vaults"): default `orderBy: totalAssets, orderDirection: desc, first: 10`. "Best APY" → `orderBy: apy`.
   - **Network**: default Mainnet. GNO / xDAI / Gnosis → Gnosis. **Cross-network fallback**: if the address returns empty on the default network, probe the other network before "no positions".

2. **Lowercase every `0x` address** before `where:`. Mixed-case silently returns empty.

3. **BigInt fields are strings** — `BigInt(...)` before arithmetic. Never JS `Number`.

4. **Cite from sections below** — never invent field names or thresholds.

5. **Filter operators**: numeric (`_gt`, `_gte`, `_lt`, `_lte`, `_in`), boolean (exact), string (`_contains_nocase`), references (`_: { ... }` for nested).

## Endpoints

| Plane | Mainnet | Gnosis |
|---|---|---|
| Subgraph (primary) | `graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod` | `graphs.stakewise.io/gnosis/subgraphs/name/stakewise/prod` |
| Subgraph (replica) | `graphs-replica.stakewise.io/mainnet/subgraphs/name/stakewise/prod` | `graphs-replica.stakewise.io/gnosis/subgraphs/name/stakewise/prod` |
| Backend GraphQL | `mainnet-api.stakewise.io/graphql` | `gnosis-api.stakewise.io/graphql` |

**Fallback (subgraph only):** primary first. On HTTP 5xx, network timeout, or malformed JSON, retry **once** against the replica for that network. A `200 OK` with `errors[]` is a query bug — fix the query, do NOT rotate. `data: { entity: null }` is a clean miss (answer accordingly). If both primary and replica fail, return an honest "subgraph is currently degraded" — do not synthesise.

**Backend GraphQL** for: vault blacklist / hidden / verified flags, paginated validators, OFAC sanctions list, average exit-queue ETA, scoring breakdown. Subgraph handles everything else. Available backend queries: `vaults`, `vaultValidators`, `ofacAddresses`, `exitStats`, `scoringDetails`. Backend has no replica.

**Boost / leverage is Mainnet only.** On Gnosis say so and skip the boost path.

### How to send a query

Every query example in this skill is GraphQL. Send one as the `query` field of a JSON POST to the relevant endpoint URL — this is the only transport, used for all examples below:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query": "<paste a graphql query here>"}' \
  https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod
```

Response shape: `{ "data": { ... } }`; errors arrive as `{ "errors": [ ... ] }` instead of `data`. Backend queries use the same POST against the backend URL — note the backend takes `id` / `blacklisted` / `first` as **direct** arguments on `vaults(...)`, not inside a subgraph-style `where`:

```graphql
{
  vaults(id: "0xVAULT") {
    id
    blacklisted
    hidden
    verified
    avgExitQueueLength
  }
}
```

**Singular vs plural — a silent trap.** `vaults(id: …)` (plural with a direct `id` arg) is **backend-only**. The subgraph's `vaults` has no `id` argument: passing one is **silently ignored** — you get the whole vault list back with no error, so reading the "first" result gives a wrong vault. A single-vault subgraph read MUST use `vault(id: …)` (singular) or `vaults(where: { id: … })`. Subgraph-only Vault fields such as `allocatorMaxBoostApy`, `apy`, `score` therefore come via `vault(id: …)` — never `vaults(id: …)`.

### Source of truth for URLs

If anything above looks stale, the canonical endpoint list is the StakeWise SDK docs at `https://docs.stakewise.io/sdk/endpoints` (source: `@stakewise/v3-sdk` `documentation/endpoints.md`). Note both the primary host (`graphs.stakewise.io`) and the replica fallback host (`graphs-replica.stakewise.io`) serve the **`/prod`** deployment; the `/stage` path on either host is a separate non-production deployment — never use it for user answers.

## Quick lookups — act on these without consulting an entity reference

The patterns below cover the typical user question. Execute directly; consult the relevant entity reference only if the question deviates (extra filter, extra field, multi-vault aggregate, time range).

### Quick lookup 1 — "What's my stake in vault X?"

```graphql
{
  allocators(
    where: {
      address: "0xUSER",
      vault: "0xVAULT"
    }
  ) {
    assets
    apy
    totalEarnedAssets
    ltvStatus
    mintedOsTokenShares
    vault {
      displayName
    }
  }
}
```

Then:
- `assets / 1e18` → ETH staked.
- `apy` is **already** percent: `parseFloat(apy).toFixed(2) + '%'`. Do NOT multiply by 100.
- `totalEarnedAssets / 1e18` → lifetime earnings (can be negative — surface as-is).
- `ltvStatus` → quote directly.
- USD: multiply ETH amounts by `assetsUsdRate` from `exchangeRates(first: 1)`.

### Quick lookup 2 — "When can I withdraw?"

```graphql
{
  exitRequests(
    where: {
      owner: "0xUSER",
      isClaimed: false
    }
  ) {
    isClaimable
    withdrawalTimestamp
    totalAssets
  }
}
```

Two branches:
- `isClaimable == true` → "ready to withdraw N ETH now".
- Otherwise → "estimated ready at `new Date(withdrawalTimestamp * 1000)`" if set; otherwise fetch backend `exitStats { duration }` and surface network-wide average ("network average is ~D days").

Field shapes in the [Position entities](references/position-entities.md).

### Quick lookup 3 — "Is my osETH position healthy?"

Prefer the precomputed `Allocator.ltvStatus` enum (`Healthy / Moderate / Risky / Unhealthy`) — quote it directly. Only when the user explicitly wants a numeric health factor, compute it with the HF formula and status mapping in [Units and gotchas](references/units-and-gotchas.md) (LtvStatus). For boost users, surface both LTVs — see [Boost entities](references/boost-entities.md).

### Quick lookup 4 — "Am I allowed to stake in this private vault?"

Private vaults gate deposits via a whitelist; some vaults also maintain a blocklist of denied addresses. Fire one combined query:

```graphql
{
  vault(id: "0xVAULT") {
    isPrivate
    isBlocklist
    whitelister
    blocklistManager
  }
  privateVaultAccounts(
    where: {
      vault: "0xVAULT",
      address: "0xUSER"
    }
  ) {
    id
  }
  vaultBlockedAccounts(
    where: {
      vault: "0xVAULT",
      address: "0xUSER"
    }
  ) {
    id
  }
}
```

Canonical query names: `privateVaultAccounts` (whitelist for `isPrivate` vaults) and `vaultBlockedAccounts` (blocklist). The natural words "whitelistAccounts" / "blocklistAccounts" do NOT exist on prod and would 200-with-`errors[]`.

Decision:
- `isPrivate == false && isBlocklist == false` → public, anyone can stake.
- `isPrivate == true` → "yes" only if `privateVaultAccounts` is non-empty. Empty → "no, not on whitelist"; surface `whitelister` so the user knows who to ask.
- `isBlocklist == true` → "no" if `vaultBlockedAccounts` is non-empty; otherwise "yes". Surface `blocklistManager` in the "no" branch.

Field shapes in the [Network and misc entities](references/network-and-misc-entities.md).

### Quick lookup 5 — "My total stake across networks"

Run this same query against **both** the Mainnet and Gnosis subgraph URLs in parallel (separate WebFetch calls — never sequential):

```graphql
{
  allocators(where: { address: "0xUSER" }) {
    assets
    totalEarnedAssets
    vault {
      id
      displayName
    }
  }
}
```

Sum `assets / 1e18` per network → `{ mainnet: N ETH, gnosis: M GNO }`. ETH and GNO are different assets — do NOT add them. For USD totals, multiply each by its network's `assetsUsdRate` (Gnosis has none on its own subgraph — see [Units and gotchas → Gnosis quirks](references/units-and-gotchas.md) for the Mainnet-fallback rule).

### Quick lookup 6 — "What vaults do I have a position in?"

One query finds every vault where an address has a stake, a pending exit, or a boost position — no need to scan the whole vault list. Run against both the Mainnet and Gnosis subgraphs in parallel.

```graphql
{
  vaults(
    where: {
      or: [
        { allocators_: { address: "0xUSER" } },
        { exitRequests_: { owner: "0xUSER" } },
        { leveragePositions_: { user: "0xUSER" } }
      ]
    }
  ) {
    id
    displayName
  }
}
```

Branches: `allocators_` = active stake · `exitRequests_` = in the exit queue · `leveragePositions_` = boost position. A vault appears once if any branch matches; drop branches to narrow (keep only `allocators_` for "where am I staking now?"). Then pull per-vault details with the matching Quick lookup above.

## Don't hallucinate

- Quote endpoint URLs and field names verbatim from the entity sections below.
- Unknown field → verify on prod via per-type introspection (see [Units and gotchas → Verify unknown fields](references/units-and-gotchas.md)). Missing on prod → say so honestly.
- Numeric thresholds (LTV status cutoffs, dust cut-off, 1000-day cap) come from **Units and gotchas** — copy, don't invent.
- Blog article URLs come from the [Blog articles](references/blog-articles.md). Do NOT paraphrase article content from training data; do not invent URLs.

## When something fails — troubleshoot in this order

1. **Empty array on user lookup** → address case. Lowercased before `where: { address }`?
2. **Empty array on vault-specific user lookup** → wrong network. Probe the other network.
3. **HTTP 5xx / timeout / malformed JSON** → primary outage. Retry once on replica (subgraph only). Second failure → surface outage.
4. **HTTP 200 + `errors[]`** → query bug. NOT a network issue, do NOT rotate. Verify field via introspection (see [Units and gotchas → Verify unknown fields](references/units-and-gotchas.md)), then retry.
5. **Number "looks wrong"** → unit confusion. Check the numeric units table in [Units and gotchas](references/units-and-gotchas.md) (`feePercent` basis points i.e. ÷100 for percent, `OsTokenConfig.*Percent` ×1e16, `Aave.*Percent` ×1e18, `apy` already %, snapshot timestamps in microseconds). Or wei→ETH (÷1e18). Negative `totalEarnedAssets` is real — surface as-is.
6. **Vault missing from marketplace answer** → forgot to exclude backend blacklist (see [Units and gotchas → Backend blacklist](references/units-and-gotchas.md)).
7. **Subgraph behind real-time** → indexing lag. Query the `Checkpoint` entity ([Network and misc entities](references/network-and-misc-entities.md)) and compare its `timestamp` with now; surface the lag and suggest a retry if stale.

If none apply → introspect the entity to verify the field still exists on prod (schemas evolve).

## Out of scope

- Writes / transactions (deposit, withdraw, mint, boost). Defer to `app.stakewise.io` or `@stakewise/v3-sdk`.
- On-chain `eth_call` reads (vesting claimable amount, `convertToAssets` rate, contract liveness). Defer to `app.stakewise.io`.
- V2 (`sETH2` / `rETH2`) deep details — V2 is legacy. The skill only detects a leftover V2 balance (`V2Pool` / `V2PoolUser`) and points the user to `app.stakewise.io` to migrate — it does not perform or explain the migration.
- Swap aggregator quotes, bridge transfers, Balancer-recovery UI flow — not subgraph data.

---

The remaining sections are reference content — GraphQL entity shapes you can scan when building a query.

## Vault entities

Entities that describe a vault — its identity, performance, access controls, MEV setup, and the link from a meta-vault to its child vaults. Use these for "what is vault X?", "list top vaults by APY", "is the vault private?", "does it support osETH?", "what sub-vaults does this meta-vault hold?".

### Vault

**Description.** A single staking vault — the most-queried entity. The id is the vault contract address (lowercase). Covers identity, APY, TVL, capacity, fee, access flags, token shape, MEV model, and meta-vault status (full field list below).

**Query example.**

```graphql
{
  vaults(
    first: 10,
    orderBy: totalAssets,
    orderDirection: desc,
    where: {
      isPrivate: false,
      isCollateralized: true,
      isOsTokenEnabled: true
    }
  ) {
    id
    displayName
    imageUrl
    apy
    baseApy
    extraApy
    allocatorMaxBoostApy
    totalAssets
    capacity
    feePercent
    score
    version
    isPrivate
    isBlocklist
    isErc20
    isOsTokenEnabled
    isMetaVault
    isCollateralized
    isGenesis
    mevEscrow
    admin
    feeRecipient
  }
}
```

**Arguments (selection).**

- `id` — filter by exact vault address (lowercase hex). Returns a single vault or null.
- `where.isPrivate` — `true` to list private (whitelist-only) vaults; `false` for public.
- `where.isBlocklist` — `true` for vaults that enforce a blocklist.
- `where.isCollateralized` — `true` to skip vaults that have not yet registered a validator (they have no APY yet).
- `where.isOsTokenEnabled` — `true` to list vaults supporting osETH/osGNO minting.
- `where.isMetaVault` — `true` to list meta-vaults only.
- `where.feePercent_lt` / `_lte` / `_gt` — fee filter (basis points; `1000` = 10%).
- `where.totalAssets_gt` — TVL filter (wei).
- `where.apy_gt` — APY filter (decimal percent string, e.g. `"3"` = 3%).
- `orderBy` — `totalAssets`, `apy`, `score`, `createdAt`, `feePercent`.
- `first` / `skip` — pagination; subgraph default `first` = 100, max = 1000.

**Modification.** The Vault entity is read-only from the skill's perspective. Configuration changes (admin transfer, fee update, deposit, exit-queue, mint osETH, transfer share token, …) happen through transactions on the vault contract — defer to `@stakewise/v3-sdk` or `app.stakewise.io`. Backend-side flags (`blacklisted`, `hidden`, `verified`) are NOT on this entity; query `vaults(...)` on the backend GraphQL endpoint instead.

**Response fields.**

Identity and metadata:
- `id: ID!` — vault address, lowercase hex.
- `addressString: String!` — case-preserving copy of the address for full-text search.
- `displayName: String` — human-readable name from IPFS metadata; null if not set.
- `description: String`
- `imageUrl: String`
- `tokenName: String` — null for non-ERC20 vaults.
- `tokenSymbol: String` — null for non-ERC20 vaults.
- `metadataIpfsHash: String`
- `metadataUpdatedAt: BigInt` — Unix seconds.
- `createdAt: BigInt!` — Unix seconds.
- `version: BigInt!` — vault contract version (1, 2, 3, 4, …).

Performance and economics:
- `apy: BigDecimal!` — current weekly-averaged annual APY, **already in percent** (e.g. `"2.71"` = 2.71%; do NOT multiply by 100).
- `baseApy: BigDecimal!` — staking-only portion.
- `extraApy: BigDecimal!` — incentive-distributions portion.
- `allocatorMaxBoostApy: BigDecimal!` — max additional APY available via boost (Mainnet only; `0` on Gnosis).
- `feePercent: Int!` — operator fee in basis points (1000 = 10%).
- `lastFeePercent: Int` — previous fee in basis points.
- `lastFeeUpdateTimestamp: BigInt` — Unix seconds.
- `score: BigDecimal!` — backend-managed performance score, already in percent (`"99.65"` = 99.65%, NOT 0.9965).

Capacity and accounting (all wei):
- `totalAssets: BigInt!` — TVL.
- `totalShares: BigInt!`
- `capacity: BigInt!` — max accepted assets.
- `queuedShares: BigInt!` — exit-queue depth in shares.
- `exitingAssets: BigInt!` — legacy V2-style exiting assets.
- `exitingTickets: BigInt!`
- `rate: BigInt!` — assets per `1e18` shares; `userAssets = userShares × rate / 1e18`.

Flags (booleans):
- `isPrivate: Boolean!` — whitelist-only.
- `isBlocklist: Boolean!`
- `isErc20: Boolean!` — exposes share-token ERC20.
- `isOsTokenEnabled: Boolean!` — accepts osToken mint.
- `isMetaVault: Boolean!` — delegates capital across sub-vaults.
- `isCollateralized: Boolean!` — has at least one registered validator.
- `isGenesis: Boolean!` — migrated from V2 pool.
- `canHarvest: Boolean!`

Addresses:
- `factory: Bytes!`
- `admin: Bytes!`
- `feeRecipient: Bytes!` — may equal `admin` if not configured separately.
- `mevEscrow: Bytes` — **null = vault uses the shared smoothing pool**; non-null = vault's own MEV escrow contract.
- `validatorsManager: Bytes`
- `depositDataManager: Bytes!`
- `whitelister: Bytes`
- `blocklistManager: Bytes`

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

Composite / derived:
- `osTokenConfig: OsTokenConfig!` — risk parameters for osToken minting against this vault (see the `OsTokenConfig` entity in the Minting and rates reference).
- `subVaults: [SubVault!]!` — only meaningful when `isMetaVault: true`; see **SubVault** below.
- `subVaultsCount: Int!` — how many sub-vaults a meta-vault holds (`0` for a normal vault).

### VaultSnapshot

**Description.** Daily snapshot of one vault's state, taken at UTC 00:00. Use to render vault APY / TVL / earnings charts.

**Query example.**

```graphql
{
  vaultSnapshots(
    where: {
      vault: "0xVAULT",
      timestamp_gte: "<(nowSec - 30 * 86400) * 1000000>"
    },
    orderBy: timestamp,
    orderDirection: desc,
    first: 30
  ) {
    timestamp
    apy
    totalAssets
    totalShares
    earnedAssets
  }
}
```

**Arguments.**

- `where.vault` — vault address (lowercase).
- `where.timestamp_gte` / `_lte` — microseconds since epoch (Unix seconds × `1_000_000`).
- `orderBy: timestamp` — daily snapshots.
- `first` — cap at 1000 days.

**Response fields.**

- `id: Bytes!`
- `timestamp: Timestamp!` — microseconds since epoch, UTC 00:00 daily boundary.
- `vault: Vault!`
- `apy: BigDecimal!` — that day's vault APY (decimal percent).
- `totalAssets: BigInt!` — end-of-day TVL (wei).
- `totalShares: BigInt!` — end-of-day total shares (wei).
- `earnedAssets: BigInt!` — that day's rewards (wei; can be negative on slashing).

### SubVault

**Description.** A link between a meta-vault and one of its child vaults. The id is `<metaVault>-<subVault>`. Used to answer "what sub-vaults does this meta-vault hold?" and the reverse "what meta-vaults wrap this sub-vault?". Both `metaVault` and `subVault` are nestable `Vault` objects, so a meta-vault's full sub-vault breakdown comes back in **one** query — no two-step lookup needed.

**Query example.** Forward — a meta-vault's sub-vaults with their details inline:

```graphql
{
  vault(id: "0xMETA_ADDR") {
    id
    displayName
    totalAssets
    apy
    subVaults {
      subVault {
        id
        displayName
        apy
        totalAssets
        feePercent
        isCollateralized
      }
    }
  }
}
```

Reverse — which meta-vault(s) wrap a given sub-vault:

```graphql
{
  subVaults(where: { subVault: "0xSUB_ADDR" }) {
    metaVault {
      id
      displayName
    }
  }
}
```

**Arguments.**

- `where.metaVault` — find sub-vaults of a given meta-vault (or just nest `vault.subVaults` as in the forward example).
- `where.subVault` — reverse lookup: find the meta-vault(s) that wrap a given sub-vault address.

**Modification.** Read-only via subgraph. Adding or removing a sub-vault is a transaction on the meta-vault contract performed by the curator — defer to the SDK.

**Response fields.**

- `id: ID!` — composite `<metaVault>-<subVault>`.
- `metaVault: Vault!` — the parent meta-vault (nestable into Vault fields).
- `subVault: Vault!` — the child vault (nestable into Vault fields).

## Position entities

User-position entities: how much someone has staked in a vault, their LTV / health status, exit-queue requests, transaction history, and daily snapshots. Use these for "what's my position?", "when can I withdraw?", "show my staking history", "show my APY over the last 30 days".

### Allocator

**Description.** A user's position in a specific vault. One Allocator row per `(vault, user)` pair. Carries the user's current shares and asset value, exit-queue size, osToken minting load, LTV, status, lifetime earnings split by stake vs boost. The id is composite: `<vault>-<address>` (both lowercase).

**Query example.**

```graphql
{
  allocators(
    where: {
      address: "0xUSER",
      mintedOsTokenShares_gt: "0"
    },
    orderBy: assets,
    orderDirection: desc
  ) {
    id
    address
    vault {
      id
      displayName
    }
    shares
    assets
    exitingAssets
    mintedOsTokenShares
    ltv
    ltvStatus
    apy
    totalEarnedAssets
    totalStakeEarnedAssets
    totalBoostEarnedAssets
  }
}
```

**Arguments.**

- `where.address` — user wallet address (lowercase). Most common filter.
- `where.vault` — single-vault position lookup; combine with `address` for "my position in vault X".
- `where.mintedOsTokenShares_gt` — only positions currently minting osToken.
- `where.assets_gt` — non-dust positions only (`100000000000000` = 0.0001 ETH cut-off; see Units and gotchas → Dust positions).
- `orderBy` — `assets`, `apy`, `mintedOsTokenShares`, `totalEarnedAssets`.

Prefer the `where: { vault, address }` form over `id: "<vault>-<address>"` — filters are forgiving about formatting; the schema does the composite-key join.

**Modification.** Read-only via subgraph. Deposit, redeem, mint osToken, exit-queue actions all happen via transactions on the vault contract — defer to the SDK.

**Response fields.**

- `id: ID!` — `<vault>-<address>`.
- `address: Bytes!` — user wallet address (lowercase).
- `vault: Vault!` — full Vault entity nestable.
- `shares: BigInt!` — vault shares held (wei).
- `assets: BigInt!` — asset-denominated position value (wei) — "how much the user has staked".
- `exitingAssets: BigInt!` — assets currently in exit queue.
- `mintedOsTokenShares: BigInt!` — osETH/osGNO minted against this position.
- `ltv: BigDecimal!` — osToken LTV as a decimal ratio 0..1 (`"0.903"` = 90.3%). Multiply by 100 for percent display. `"0"` when nothing is minted.
- `ltvStatus: LtvStatus!` — enum `Healthy | Moderate | Risky | Unhealthy`, precomputed server-side. Prefer over manual HF math.
- `apy: BigDecimal!` — user's effective weekly-averaged APY as a decimal-percent string.
- `totalEarnedAssets: BigInt!` — lifetime rewards in wei. **Signed** — can be negative on slashing/penalty (a string like `"-170381003445038367"`). Surface the real value; do not clamp.
- `totalStakeEarnedAssets: BigInt!` — staking portion of lifetime earnings.
- `totalBoostEarnedAssets: BigInt!` — boost portion of lifetime earnings.
- `exitRequests: [ExitRequest!]!` — derived; user's exit-queue entries on this vault.

The osToken LTV here is one of two LTVs in StakeWise; the other (Aave borrow LTV) lives on `LeverageStrategyPosition` — see the Boost entities reference. They are unrelated and have different liquidation thresholds.

### AllocatorAction

**Description.** A transaction-log entry for one user action on one vault. Use to render a user's staking history, audit deposits and withdrawals, or scope to specific action types.

**Query example.**

```graphql
{
  allocatorActions(
    where: {
      address: "0xUSER",
      actionType_in: [Deposited, OsTokenMinted, ExitQueueEntered]
    },
    orderBy: createdAt,
    orderDirection: desc,
    first: 50
  ) {
    id
    hash
    actionType
    vault {
      id
      displayName
    }
    assets
    shares
    createdAt
  }
}
```

**Arguments.**

- `where.address` — user wallet address.
- `where.vault` — limit to a single vault.
- `where.actionType` / `actionType_in` — filter by one or more action types.
- `where.createdAt_gte` / `_lte` — time range (Unix seconds).
- `orderBy: createdAt`, `orderDirection: desc` — newest first (the usual layout for "history").
- `first` / `skip` — paginate; capped at 1000 per request.

**Response fields.**

- `id: ID!` — `<tx-hash>-<log-index>`.
- `hash: Bytes!` — transaction hash.
- `vault: Vault!`
- `address: Bytes!` — actor address (lowercase).
- `actionType: AllocatorActionType!` — enum.
- `assets: BigInt` — assets moved (wei); null when the action does not move assets.
- `shares: BigInt` — shares moved (wei); null when the action does not move shares.
- `createdAt: BigInt!` — Unix seconds.

`AllocatorActionType` enum values: `VaultCreated`, `Deposited`, `Redeemed`, `TransferIn`, `TransferOut`, `ExitQueueEntered`, `ExitedAssetsClaimed`, `OsTokenMinted`, `OsTokenBurned`, `OsTokenRedeemed`, `OsTokenLiquidated`, `BoostDeposited`, `BoostExitQueueEntered`, `BoostExitedAssetsClaimed`, `Migrated`.

### AllocatorSnapshot

**Description.** A daily snapshot of one allocator's state, taken at UTC 00:00. Use to render APY-over-time charts, day-by-day earnings, and historical LTV.

**Query example.**

```graphql
{
  allocatorSnapshots(
    where: {
      allocator_: {
        address: "0xUSER",
        vault: "0xVAULT"
      },
      timestamp_gte: "<(nowSec - 90 * 86400) * 1000000>"
    },
    orderBy: timestamp,
    orderDirection: desc,
    first: 90
  ) {
    timestamp
    apy
    ltv
    totalAssets
    earnedAssets
    stakeEarnedAssets
    boostEarnedAssets
  }
}
```

**Arguments.**

- `where.allocator_` — nested filter on the parent Allocator (note the trailing `_`). Combine `address` and `vault` here.
- `where.timestamp_gte` / `_lte` — time range in **microseconds since epoch**, NOT seconds. Multiply Unix seconds by `1_000_000`.
- `orderBy: timestamp` — daily snapshots, sorted ascending or descending.
- `first` — keep ≤ 1000 to stay within the client-side cap.

**Response fields.**

- `id: Bytes!`
- `timestamp: Timestamp!` — **microseconds since epoch** (Unix seconds × `1_000_000`). UTC 00:00 boundary daily.
- `allocator: Allocator!`
- `apy: BigDecimal!` — that day's effective APY (decimal percent).
- `ltv: BigDecimal!` — end-of-day osToken LTV.
- `totalAssets: BigInt!` — end-of-day position value (wei).
- `earnedAssets: BigInt!` — that day's rewards (wei; **can be negative** on slashing).
- `stakeEarnedAssets: BigInt!` — staking portion.
- `boostEarnedAssets: BigInt!` — boost portion.

### ExitRequest

**Description.** A queued unstake from a vault. One row per `(vault, positionTicket)`. Use to answer "when can I withdraw?", "how much is queued?", "is it claimable yet?".

**Query example.**

```graphql
{
  exitRequests(
    where: {
      owner: "0xUSER",
      isClaimed: false
    },
    orderBy: timestamp,
    orderDirection: desc,
    first: 20
  ) {
    id
    positionTicket
    isV2Position
    owner
    receiver
    vault {
      id
      displayName
    }
    totalTickets
    totalAssets
    exitedAssets
    timestamp
    withdrawalTimestamp
    isClaimable
    isClaimed
    exitQueueIndex
  }
}
```

**Arguments.**

- `where.owner` — original staker wallet address (lowercase). Use for "my pending withdrawals".
- `where.receiver` — destination address (may differ from owner if exit was queued on behalf of someone).
- `where.vault` — limit to one vault.
- `where.isClaimable` — `true` for ready-to-withdraw requests.
- `where.isClaimed` — `false` to filter out already-withdrawn rows.

**Modification.** Created by `enterExitQueue(...)` on the vault contract; cleared by `claimExitedAssets(...)`. Defer the mutation to the SDK / app.

**Response fields.**

- `id: ID!` — `<vault>-<positionTicket>`.
- `positionTicket: BigInt!`
- `isV2Position: Boolean!` — exit request from a legacy V2 vault.
- `owner: Bytes!` — who queued the exit (lowercase).
- `receiver: Bytes!` — who will receive funds upon claim (may differ from owner).
- `allocator: Allocator!`
- `vault: Vault!`
- `totalTickets: BigInt!`
- `totalAssets: BigInt!` — queued assets in wei.
- `exitedAssets: BigInt!` — already withdrawable in wei.
- `exitQueueIndex: BigInt` — `null` until claimable.
- `timestamp: BigInt!` — Unix seconds when queued.
- `withdrawalTimestamp: BigInt` — backend-estimated Unix-seconds timestamp for when it becomes claimable; nullable. When null, fall back to `Vault.avgExitQueueLength` (backend) or backend `exitStats.duration` for a network-wide average.
- `isClaimable: Boolean!`
- `isClaimed: Boolean!`

## Minting and rates entities

osToken-related entities: who holds osETH/osGNO, per-vault minting risk parameters, the global osToken stats singleton, osToken redemption queue, and current + historical exchange rates between assets and USD/EUR/etc. Use for "how much osETH can I mint here?", "what's the osToken supply?", "what's the osETH→USD rate?", "what's my redemption status?", "show ETH→USD rate over 30 days".

### OsTokenHolder

**Description.** A wallet's osToken (osETH or osGNO) balance plus transfer counter. One row per address that has ever held osToken on this chain.

**Query example.**

```graphql
{
  osTokenHolders(where: { id: "0xUSER" }) {
    id
    balance
    transfersCount
  }
}
```

**Arguments.**

- `where.id` — holder address (lowercase). Same as filtering by user.
- `where.balance_gt` — non-dust holders only.

**Modification.** Read-only. Balance changes via ERC20 transfers of osToken or via mint/redeem on the OsToken contract.

**Response fields.**

- `id: ID!` — holder address (lowercase).
- `balance: BigInt!` — current osToken share count (wei).
- `transfersCount: BigInt!` — lifetime transfer count for this holder.

To convert `balance` (osToken shares) to assets, multiply by `ExchangeRate.osTokenAssetsRate` (see below) — or call the `MintTokenController.convertToAssets(shares)` view on-chain.

**SWISE holders.** An identical entity exists for the SWISE governance token: `swiseTokenHolders(where: { id: "0xUSER" }) { id balance transfersCount }` returns a wallet's SWISE `balance` (wei) and lifetime `transfersCount`. Same fields and units as `OsTokenHolder` above — use it for "how much SWISE does this address hold?" or "how many SWISE transfers has it made?".

### OsTokenConfig

**Description.** Risk parameters controlling how much osToken a user can mint against their stake in a vault: max mint LTV, the boost strategy's mint cap, and the liquidation threshold. Most vaults share one of a few governance-defined **template** configs whose id is a small integer (`"1"`, `"2"`); only a few vaults (e.g. Genesis) carry a per-vault override config keyed by the vault address. Always read a vault's config through the `vault.osTokenConfig` relation — do NOT query `osTokenConfigs(where: { id: "0xVAULT" })`, which returns empty for the majority of vaults that use a shared template.

**Query example.**

```graphql
{
  vault(id: "0xVAULT") {
    osTokenConfig {
      id
      ltvPercent
      leverageMaxMintLtvPercent
      liqThresholdPercent
    }
  }
}
```

**Arguments.** Read via the `vault.osTokenConfig` relation as above. A standalone `osTokenConfigs(first: 10)` query lists the shared template configs themselves (rarely needed).

**Modification.** Protocol-level risk parameters controlled by StakeWise DAO governance, not by the vault operator or the user — so if a user asks to change their mint LTV or liquidation threshold on a vault, the answer is that these are not user-settable.

**Response fields.** All three are "percent × 1e16" wei-style integers (divide by 1e16 for percent), NOT basis points — see the Units and gotchas reference.

- `id: ID!` — config id: a small integer for a shared template (`"1"`, `"2"`), or the vault address for a per-vault override.
- `ltvPercent: BigInt!` — max LTV a regular user can mint at. Typically `"900000000000000000"` = 90%; special vaults (e.g. Genesis) use ~99.99%.
- `leverageMaxMintLtvPercent: BigInt!` — the mint LTV the boost (leverage) strategy is allowed to reach. **`0` means boost is not available on this vault**; otherwise it is *higher* than `ltvPercent` (e.g. `"995000000000000000"` = 99.5%), because the leverage strategy may mint closer to the limit than a regular user — it raises the ceiling, it does not tighten it.
- `liqThresholdPercent: BigInt!` — osToken liquidation threshold. Typically `"920000000000000000"` = 92%. The sentinel `"18446744073709551615"` (2^64−1) means **liquidation is disabled** for that vault (e.g. Genesis) — surface "no osToken liquidation", do NOT render it as ~1844%.

### osTokens (singleton)

**Description.** A network-wide osToken stat aggregate. Always queried as `osTokens(first: 1)` — there is one row per chain. Use to answer "what's the current osETH yield?", "how much osETH is in circulation?", "what's the protocol fee on osToken?".

**Query example.**

```graphql
{
  osTokens(first: 1) {
    apy
    apys
    feePercent
    totalSupply
    totalAssets
  }
}
```

**Arguments.** No useful filters; always `first: 1`.

**Response fields.**

- `apy: BigDecimal!` — current weekly-averaged osToken yield (decimal percent).
- `apys: [BigDecimal!]!` — historical APY snapshot list (recent first).
- `feePercent: Int!` — protocol fee charged on osToken (basis points). The 5% LST fee.
- `totalSupply: BigInt!` — total osToken shares minted (wei).
- `totalAssets: BigInt!` — total underlying assets backing the osToken (wei).

### OsTokenExitRequest

**Description.** A queued osToken-to-asset redemption (separate from a regular vault exit). One row per `(vault, positionTicket)`. Use to track the osToken redemption queue.

**Query example.**

```graphql
{
  osTokenExitRequests(where: { owner: "0xUSER" }) {
    id
    positionTicket
    owner
    vault {
      id
      displayName
    }
    osTokenShares
    exitedAssets
    ltv
  }
}
```

**Arguments.**

- `where.owner` — user wallet address.
- `where.vault` — limit to one vault.

**Modification.** Created on `redeemOsToken(...)` on the vault contract; defer the transaction to the SDK.

**Response fields.**

- `id: ID!` — `<vault>-<positionTicket>`.
- `owner: Bytes!`
- `vault: Vault!`
- `positionTicket: BigInt!`
- `exitedAssets: BigInt` — assets out (wei); null until processed.
- `osTokenShares: BigInt!` — osToken shares being redeemed (wei).
- `ltv: BigDecimal!` — LTV at time of request (decimal ratio 0..1).

### ExchangeRate

**Description.** Singleton (`id: "0"`) holding the latest known prices for asset, osToken, ancillary tokens (SWISE, Obol, SSV), and fiat conversions. Use for any USD or fiat math.

**Query example.**

```graphql
{
  exchangeRates(first: 1) {
    osTokenAssetsRate
    assetsUsdRate
    ethUsdRate
    btcUsdRate
    solUsdRate
    daiUsdRate
    usdcUsdRate
    swiseUsdRate
    obolUsdRate
    ssvUsdRate
    usdToEurRate
    usdToGbpRate
    usdToCnyRate
    usdToJpyRate
    usdToKrwRate
    usdToAudRate
  }
}
```

**Arguments.** `first: 1` (singleton).

**Modification.** Updated by the protocol indexer at ~hourly cadence.

**Response fields.** All rates are decimal strings.

- `osTokenAssetsRate` — how many native assets equal 1 osToken share (e.g. `"0.96"` = 1 osETH share is worth 0.96 ETH). Multiply osToken share count by this rate.
- `assetsUsdRate` — chain's native asset in USD (`ethUsdRate` for Mainnet, `gnoUsdRate` semantics for Gnosis under the same field name).
- `ethUsdRate`, `btcUsdRate`, `solUsdRate`, `daiUsdRate`, `usdcUsdRate`, `swiseUsdRate`, `obolUsdRate`, `ssvUsdRate` — token-USD rates.
- `usdToEurRate`, `usdToGbpRate`, `usdToCnyRate`, `usdToJpyRate`, `usdToKrwRate`, `usdToAudRate` — fiat conversion.

**osToken → USD.** Compose both rates: `osTokenUSD = (osTokenShares / 1e18) × osTokenAssetsRate × assetsUsdRate`. Step 1 (`× osTokenAssetsRate`) converts shares to the native asset (ETH/GNO); step 2 (`× assetsUsdRate`) converts that to USD. For osGNO use Mainnet's `osTokenAssetsRate` (see Gnosis fallback).

**Gnosis fallback.** On Gnosis the fiat (`usdTo*Rate`) and `osTokenAssetsRate` fields are unreliable for USD math — use the Mainnet values instead. Full rule and the osGNO USD formula live in Units and gotchas → Gnosis quirks (single source of truth).

### ExchangeRateSnapshot

**Description.** Periodic (~hourly) snapshot of all rates. Use for fine-grained time-series of any rate field.

**Query example.**

```graphql
{
  exchangeRateSnapshots(
    where: { timestamp_gte: "<(nowSec - 7 * 86400) * 1000000>" },
    orderBy: timestamp,
    first: 200
  ) {
    timestamp
    assetsUsdRate
    osTokenAssetsRate
  }
}
```

**Arguments.**

- `where.timestamp_gte` / `_lte` — microseconds since epoch.
- `orderBy: timestamp`.

**Response fields.** Same field shape as `ExchangeRate`, plus `timestamp: Timestamp!` in microseconds.

### ExchangeRateStats (aggregation)

**Description.** Daily aggregation of `ExchangeRateSnapshot` via the subgraph `@aggregation` mechanism. Use for "show last 30 days of ETH→USD" style queries when hourly precision isn't needed.

**Query example.** Use the `_collection` (lowercase first letter) query form:

```graphql
{
  exchangeRateStats_collection(
    interval: day,
    first: 30,
    where: { timestamp_gte: "<(nowSec - 30 * 86400) * 1000000>" }
  ) {
    timestamp
    assetsUsdRate
    osTokenAssetsRate
    swiseUsdRate
    usdToEurRate
    usdToGbpRate
    usdToCnyRate
    usdToJpyRate
  }
}
```

**Arguments.**

- `interval: day` — aggregation bucket.
- `first` — limit.
- `where.timestamp_gte` / `_lte` — microseconds.

**Response fields.** Same shape as `ExchangeRate`, with `timestamp` at the end of each daily bucket (microseconds).

## Boost entities

Boost-related entities (leverage strategy): the leverage strategy position, the Aave singleton, and per-user Aave borrow state. Use for "what's my boost balance?", "is my boost position safe?", "what's the borrow LTV?", "can I open a new boost position?".

Only operational on **Mainnet**. On Gnosis the leverage strategy is not deployed: `leverageStrategyPositions` and `aavePositions` come back empty, and the `Aave` singleton exists but reads all-zero — so treat boost as unavailable on Gnosis.

### LeverageStrategyPosition

**Description.** A user's boost position in one vault. One row per `(vault, user)`. The id is composite: `<vault>-<user>`. This is what the app reads to render the "Boost: N osETH" line — NOT `AavePosition`. See "Boost balance formula" below.

**Query example.**

```graphql
{
  leverageStrategyPositions(
    where: {
      user: "0xUSER",
      vault: "0xVAULT"
    }
  ) {
    id
    user
    proxy
    version
    vault {
      id
      displayName
    }
    osTokenShares
    assets
    borrowLtv
    exitingPercent
    exitingOsTokenShares
    exitingAssets
    exitRequest {
      id
      positionTicket
      isClaimable
      withdrawalTimestamp
    }
  }
}
```

**Arguments.**

- `where.user` — user wallet address (lowercase). Most common filter.
- `where.vault` — single vault.
- `where.borrowLtv_gt` — at-risk positions.

**Modification.** Boost actions (open, increase, exit) happen via the leverage strategy contract through SDK calls — defer mutation to the SDK / app.

**Response fields.**

- `id: ID!` — `<vault>-<user>`.
- `proxy: Bytes!` — the per-user leverage-proxy contract address. Use **this** address (not the user's wallet) to filter the user's `AavePosition`.
- `user: Bytes!` — user wallet address (lowercase).
- `vault: Vault!`
- `osTokenShares: BigInt!` — osToken share count locked **inside the leverage strategy contract**. NOT the user-facing Boost balance — see formula below.
- `assets: BigInt!` — accrued reward assets not yet auto-restaked, in the native asset (ETH/GNO). SDK alias: `boostRewardAssets`. For the user-facing boost balance, convert to osToken shares as `assets / osTokenAssetsRate` and add to `osTokenShares` (subgraph-only — see Boost balance formula below).
- `borrowLtv: BigDecimal!` — current Aave borrow LTV, **decimal ratio 0..1** (e.g. `"0.9311"` = 93.11%). Multiply by 100 for percent display.
- `exitingPercent: BigInt!` — fraction in unboost queue as a wad (`1e18` = 100%).
- `exitingOsTokenShares: BigInt!` — osToken shares being unboosted (wei).
- `exitingAssets: BigInt!` — assets being unboosted (wei).
- `exitRequest: ExitRequest` — nullable; set when an unboost is queued. Nest into ExitRequest fields for ETA.
- `version: BigInt!` — leverage proxy version.

**Boost balance formula.** `app.stakewise.io` shows the user's "Boost: N osETH" as:

```
boostBalanceShares = osTokenShares + (assets / osTokenAssetsRate)
  - assets            = LeverageStrategyPosition.assets  (ETH-denominated reward, not yet restaked)
  - osTokenAssetsRate = ExchangeRate.osTokenAssetsRate   (from exchangeRates(first: 1))
```

`assets / osTokenAssetsRate` is the subgraph approximation of the app's on-chain `MintTokenController.convertToShares(assets)` — fully computable from the subgraph (no on-chain call), accurate to the same `osTokenAssetsRate` this skill uses for osETH↔ETH elsewhere. Lead with `osTokenShares` and add this term for the full figure. The Aave-side numbers (`suppliedOsTokenShares`, `borrowedAssets`) explain the supply/borrow loop but do NOT appear in the user-facing Boost number.

**Borrow status thresholds.** Computed client-side from `borrowLtv`. Intentionally stricter than Aave's actual 94.5% threshold to give users a warning buffer.

| `borrowLtv` | Status | Why |
|---|---|---|
| ≤ 0.938 | Healthy | ~0.7% buffer below Aave's threshold |
| 0.938 – 0.945 | Moderate | early warning, Aave's threshold imminent |
| > 0.945 | Risky | at/past Aave's threshold; liquidation can fire |

**Two LTVs — do not confuse with `Allocator.ltv`.** StakeWise has two unrelated LTV metrics that share the abbreviation. A user can simultaneously have a **Healthy osToken LTV (e.g. 65%)** and a **Risky borrow LTV (e.g. 94%)** — they measure different positions.

| LTV | Lives on | Numerator / denominator | Liquidation threshold | Liquidator |
|---|---|---|---|---|
| osToken LTV | `Allocator.ltv` | `mintedOsETH_value / stakedETH` | `OsTokenConfig.liqThresholdPercent` (~92%) | StakeWise vault contract |
| Borrow LTV | `LeverageStrategyPosition.borrowLtv` | `borrowedETH / (suppliedOsETH × osTokenAssetsRate)` | Aave's market threshold for osETH (~94.5%) | Aave |

Surface both when answering "is my boost healthy?" — the query example above returns only `borrowLtv`; fetch the osToken side too via `allocators(where: { address, vault }) { ltv ltvStatus }` (Quick lookup 1) in the same batch.

**Available (max) boost APY.** This entity is a user's *existing* boost position. For the max boost APY a vault offers a new staker ("what boost APY can I get here?"), read `Vault.allocatorMaxBoostApy` (Vault entity — already percent, Mainnet only); it is not on this entity.

### Aave (singleton)

**Description.** Marketplace-wide Aave state used by boost: current borrow / supply APYs, the leverage-specific borrow LTV cap, and supply-cap saturation. Always `aaves(first: 1)`.

**Query example.**

```graphql
{
  aaves(first: 1) {
    borrowApy
    supplyApy
    leverageMaxBorrowLtvPercent
    osTokenSupplyCap
    osTokenTotalSupplied
  }
}
```

**Arguments.** `first: 1` (singleton).

**Response fields.**

- `borrowApy: BigDecimal!` — Aave's current ETH borrow APY, **already in percent** (`"2.665"` = 2.665%).
- `supplyApy: BigDecimal!` — osETH supply APY (typically near zero — no supply incentives).
- `leverageMaxBorrowLtvPercent: BigInt!` — **18-decimal fixed point**, NOT basis points. Value ÷ 1e18 = ratio (`"929999998000000000"` ÷ 1e18 = 0.93 = 93%).
- `osTokenSupplyCap: BigInt!` — total osETH that can be supplied to Aave (wei).
- `osTokenTotalSupplied: BigInt!` — currently supplied (wei). `supplied / cap` = utilisation. At 100% no new boost positions can open.

### AavePosition

**Description.** A user's borrow state at Aave. The id is the user address — but for boost positions the "user" is the leverage proxy (`LeverageStrategyPosition.proxy`), NOT the user's wallet.

**Query example.**

```graphql
{
  aavePositions(where: { user: "0xPROXY" }) {
    id
    user
    aave {
      borrowApy
      supplyApy
    }
    suppliedOsTokenShares
    borrowedAssets
  }
}
```

**Arguments.**

- `where.user` — the leverage proxy address. Look this up first via `LeverageStrategyPosition.proxy`.

**Response fields.**

- `id: ID!` — user address (the proxy, lowercase).
- `user: Bytes!`
- `aave: Aave!`
- `suppliedOsTokenShares: BigInt!` — osToken shares supplied as collateral (wei).
- `borrowedAssets: BigInt!` — borrowed amount in native asset (wei).

## Rewards entities

Merkle airdrop claims, per-token reward trackers, reward splitters that share fee proceeds between beneficiaries, and active incentive campaigns. Use for "what can I claim?", "show active incentive campaigns", "who gets paid from this vault's fee?", "what's my reward-splitter share?".

### DistributorClaim

**Description.** Unclaimed merkle rewards per user. One row per address. Uses three parallel arrays (zipped): `tokens[i]`, `cumulativeAmounts[i]`, `unclaimedAmounts[i]` describe one reward token line each. Empty arrays mean nothing claimable.

**Query example.**

```graphql
{
  distributorClaims(id: "0xUSER") {
    user
    tokens
    cumulativeAmounts
    unclaimedAmounts
    proof
  }
}
```

**Arguments.**

- `id` — user address (lowercase).
- `where.user` — equivalent.

**Modification.** Created and updated by the merkle distributor's off-chain process. To redeem, the user calls `claim(...)` on the merkle distributor contract with the proof — defer to the SDK.

**Response fields.**

- `id: ID!` — user address (lowercase).
- `user: Bytes!`
- `tokens: [Bytes!]!` — reward token contract addresses; ordered, parallel to the two amount arrays.
- `cumulativeAmounts: [BigInt!]!` — cumulative amounts per token (wei).
- `unclaimedAmounts: [BigInt!]!` — still claimable per token (wei).
- `proof: [String!]!` — merkle proof for on-chain claim.

Surface a per-token line in the answer (each `tokens[i]` is a distinct ERC20 with its own decimals — never sum across).

### DistributorReward

**Description.** Cumulative tracker per `(token, user)` pair. Less commonly queried directly — usually you go through `DistributorClaim` for the actionable "what's claimable now". Use this entity when you need lifetime totals across already-claimed amounts.

**Query example.**

```graphql
{
  distributorRewards(where: { user: "0xUSER" }) {
    id
    user
    token
    cumulativeAmount
  }
}
```

**Arguments.**

- `where.user` — user wallet address.
- `where.token` — specific reward token address.

**Response fields.**

- `id: ID!` — composite `<token>-<user>`.
- `user: Bytes!`
- `token: Bytes!` — reward token contract address.
- `cumulativeAmount: BigInt!` — lifetime cumulative reward (wei).

### Distributor (global)

**Description.** Global merkle distributor state — list of active distribution IDs and distribution contract addresses. Singleton (`id: "0"`). Rarely queried; usually you use `DistributorClaim` or `PeriodicDistribution`.

**Query example.**

```graphql
{
  distributors(first: 1) {
    activeDistributionIds
    activeDistributors
  }
}
```

**Response fields.**

- `id: ID!` — singleton (`"0"`).
- `activeDistributionIds: [String!]!` — current campaign IDs.
- `activeDistributors: [Bytes!]!` — distribution contract addresses.

### PeriodicDistribution

**Description.** A scheduled incentive campaign that distributes a reward token to a target (a specific vault, the SWISE/ETH Uniswap pool, the osETH/USDC Uniswap pool, or the leverage strategy). Use to answer "what active incentives are running?" or "what's the boosted APY on this vault?".

**Query example.**

```graphql
{
  periodicDistributions(
    where: {
      startTimestamp_lte: "<nowSec>",
      endTimestamp_gt: "<nowSec>"
    },
    orderBy: endTimestamp,
    orderDirection: asc
  ) {
    id
    hash
    distributionType
    data
    token
    amount
    apy
    startTimestamp
    endTimestamp
  }
}
```

**Arguments.**

- `where.startTimestamp_lte` + `endTimestamp_gt` — active-now filter (both compared against the current Unix-second timestamp).
- `where.distributionType` — filter to a campaign category (see enum below).
- `where.data` — when `distributionType == VAULT`, this holds the target vault address — useful to find incentives targeting a specific vault.

**Modification.** Created/updated by the protocol governor.

**Response fields.**

- `id: ID!`
- `hash: Bytes!`
- `distributionType: DistributionType!` — enum: `VAULT`, `SWISE_ASSET_UNI_POOL`, `OS_TOKEN_USDC_UNI_POOL`, `LEVERAGE_STRATEGY`, `UNKNOWN`.
- `data: Bytes!` — extra identifier (vault address when type = `VAULT`).
- `token: Bytes!` — reward token contract.
- `amount: BigInt!` — total reward distributed over the period (wei).
- `apy: BigDecimal!` — incentive APY at current rate (decimal percent).
- `startTimestamp: BigInt!` — Unix seconds.
- `endTimestamp: BigInt!` — Unix seconds.

### RewardSplitter

**Description.** A contract that splits a vault's fee proceeds between named beneficiaries. The vault's `feeRecipient` points at the splitter; the splitter then distributes by share weight. One RewardSplitter per splitter contract.

**Query example.**

```graphql
{
  rewardSplitters(where: { vault: "0xVAULT" }) {
    id
    owner
    claimer
    totalShares
    version
    vault {
      id
      displayName
    }
    shareHolders {
      address
      shares
      earnedVaultShares
      earnedVaultAssets
    }
  }
}
```

**Arguments.**

- `where.vault` — find the splitter for a specific vault.
- `where.owner` — splitters administered by a given address.

**Modification.** Adding/removing beneficiaries or changing the share split is an owner-only transaction on the splitter contract — defer to the SDK.

**Response fields.**

- `id: ID!` — splitter contract address (lowercase).
- `version: BigInt!` — splitter contract version.
- `owner: Bytes!` — admin who can change beneficiaries.
- `claimer: Bytes` — optional auto-claimer permission (nullable).
- `totalShares: BigInt!` — sum of beneficiary shares (in practice `100e18`).
- `vault: Vault!`
- `shareHolders: [RewardSplitterShareHolder!]!` — derived list of beneficiaries.

### RewardSplitterShareHolder

**Description.** One beneficiary entry on a reward splitter. Use to answer "what's my share of this vault's fee?" or "what have I earned via this splitter so far?".

**Query example.**

```graphql
{
  rewardSplitterShareHolders(where: { address: "0xBENEFICIARY" }) {
    id
    address
    shares
    earnedVaultShares
    earnedVaultAssets
    rewardSplitter {
      id
      totalShares
      vault {
        id
        displayName
      }
    }
  }
}
```

**Arguments.**

- `where.address` — beneficiary wallet address. Find all splitter positions a user has.
- `where.rewardSplitter` — beneficiaries on a specific splitter.
- `where.vault` — beneficiaries via splitters on a specific vault.

**Response fields.**

- `id: ID!` — composite `<splitterAddress>-<holderAddress>`.
- `rewardSplitter: RewardSplitter!`
- `vault: Vault!`
- `address: Bytes!` — beneficiary wallet address (lowercase).
- `shares: BigInt!` — beneficiary share count (out of `RewardSplitter.totalShares`).
- `earnedVaultShares: BigInt!` — accumulated vault shares earned via this allocation (wei).
- `earnedVaultAssets: BigInt!` — same in asset-denominated wei.

## Vesting entities

The single entity that tracks vesting escrow positions for users. The subgraph stores only escrow identity; amounts and the schedule live on-chain on each escrow's proxy contract.

### VestingEscrow

**Description.** One row per vesting escrow proxy contract for a user. Use to answer "do I have any vesting positions?", "which escrow contracts are mine?", "what token is being vested?".

**Query example.**

```graphql
{
  vestingEscrows(where: { recipient: "0xUSER" }) {
    id
    token
    recipient
  }
}
```

**Arguments.**

- `where.recipient` — beneficiary wallet address (lowercase). The most common filter.
- `where.token` — restrict to a specific vested token (e.g. SWISE).

**Modification.** Created when the protocol grants a vesting position. Claiming happens via the escrow contract's `claim(...)` call — defer to the SDK or `app.stakewise.io`.

**Response fields.**

- `id: ID!` — escrow proxy contract address (lowercase).
- `token: String!` — the ERC20 token contract address being vested (lowercase hex; the field type is `String` for legacy reasons, but the value is an address — e.g. `"0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2"` for SWISE on Mainnet).
- `recipient: Bytes!` — beneficiary wallet address (lowercase).

**What the subgraph does NOT tell you.** To get the **amount currently claimable**, the start/end of the vesting window, or whether the escrow is paused, you must call the escrow contract on-chain (each escrow is an EIP-1167 proxy of a shared implementation). The skill no longer ships an RPC fallback — so for amount/schedule questions, point the user to `app.stakewise.io` (the vesting page renders these from the same on-chain calls) and surface the escrow contract address from this entity so they know what to look at.

Do not estimate claimable yourself with `total × (now − start) / (end − start) − claimed` — that formula diverges from the contract when cliff or pause logic is involved.

## Network and misc entities

Network-wide aggregates, sync state, access-control lists, address-type checker, ERC20 transfer log, V2 legacy entities, and Uniswap LP positions on StakeWise pairs. Use for "what's the network TVL?", "is the subgraph in sync?", "is the user whitelisted?", "show osETH transfers", "do I have V2 leftovers?".

### Network

**Description.** Singleton (`id: "0"`) holding chain-wide aggregates. Use for "total TVL on this chain", "total users", or "total rewards distributed".

**Query example.**

```graphql
{
  networks(first: 1) {
    totalAssets
    totalEarnedAssets
    vaultsCount
    usersCount
    vaultIds
    osTokenVaultIds
    factoriesInitialized
    oraclesConfigIpfsHash
  }
}
```

**Arguments.** `first: 1` (singleton).

**Response fields.**

- `id: ID!` — always `"0"`.
- `factoriesInitialized: Boolean!`
- `totalAssets: BigInt!` — total staked in wei across all vaults of this chain.
- `totalEarnedAssets: BigInt!` — total network rewards in wei.
- `vaultsCount: Int!` — count of all vaults on the chain.
- `vaultIds: [String!]!` — every vault address (string form).
- `osTokenVaultIds: [String!]!` — subset used in osToken rate calculation.
- `oraclesConfigIpfsHash: String!`
- `usersCount: Int!` — unique allocators plus osToken holders.

For "total across all StakeWise" fire one query per chain in parallel and sum.

### Checkpoint

**Description.** Subgraph sync state. Latest checkpoint's `timestamp` indicates how recently the indexer processed a block. Use to detect indexing lag.

**Query example.**

```graphql
{
  checkpoints(
    first: 1,
    orderBy: timestamp,
    orderDirection: desc
  ) {
    timestamp
  }
}
```

**Arguments.** `first: 1`, `orderBy: timestamp`, `orderDirection: desc`.

**Modification.** Written by the indexer.

**Response fields.**

- `id: Bytes!`
- `timestamp: BigInt!` — Unix seconds of the last processed block.

If `Math.floor(Date.now() / 1000) - timestamp` > ~30 seconds, surface the lag to the user and suggest a ~10 s retry. After a fresh transaction, expect 1–5 s before the new block is reflected.

### PrivateVaultAccount

**Description.** Whitelist entry for a private vault. The entity name does NOT match the natural word "whitelist" — always use this canonical name in queries.

**Query example.** Is this address whitelisted on this vault:

```graphql
{
  privateVaultAccounts(
    where: {
      vault: "0xVAULT",
      address: "0xUSER"
    }
  ) {
    id
    createdAt
  }
}
```

List all whitelisted addresses for a vault (paginated):

```graphql
{
  privateVaultAccounts(
    where: { vault: "0xVAULT" },
    first: 50
  ) {
    address
    createdAt
  }
}
```

**Arguments.**

- `where.vault` — vault address.
- `where.address` — candidate user wallet address.

Always check `Vault.isPrivate` first to know whether the whitelist matters for the vault.

**Modification.** The vault's `whitelister` adds/removes via transactions on the vault contract — defer mutation.

**Response fields.**

- `id: ID!` — composite `<vault>-<address>`.
- `address: Bytes!`
- `vault: Vault!`
- `createdAt: BigInt!` — Unix seconds.

### VaultBlockedAccount

**Description.** Blocklist entry. Mirrors `PrivateVaultAccount` shape. Check `Vault.isBlocklist` to know whether the list is enforced.

**Query example.**

```graphql
{
  vaultBlockedAccounts(
    where: { vault: "0xVAULT" },
    first: 50
  ) {
    address
    createdAt
  }
}
```

**Arguments.**

- `where.vault` — vault address.
- `where.address` — candidate user wallet address.

**Modification.** Managed by `Vault.blocklistManager` via on-chain transactions.

**Response fields.**

- `id: ID!` — composite `<vault>-<address>`.
- `address: Bytes!`
- `vault: Vault!`
- `createdAt: BigInt!` — Unix seconds.

### UserIsContract

**Description.** Quick check whether an address is a wallet (externally-owned account) or a contract. Useful when explaining a position to a user who pasted a multisig address.

**Query example.**

```graphql
{
  userIsContracts(where: { id: "0xADDR" }) {
    isContract
  }
}
```

**Response fields.**

- `id: Bytes!` — address (lowercase).
- `isContract: Boolean!`

### TokenTransfer

**Description.** ERC20 transfer log entries for osETH / osGNO / SWISE and related tokens. Use for "show my osETH movements" or "trace where this osETH came from".

**Query example.**

```graphql
{
  tokenTransfers(
    where: {
      tokenSymbol: "osETH",
      from: "0xUSER"
    },
    orderBy: timestamp,
    orderDirection: desc,
    first: 50
  ) {
    hash
    amount
    from
    to
    timestamp
    tokenSymbol
  }
}
```

**Arguments.**

- `where.tokenSymbol` — `"osETH"`, `"osGNO"`, `"SWISE"`.
- `where.from` / `where.to` — addresses (lowercase). Combine to find specific flows.
- `where.timestamp_gte` / `_lte` — Unix seconds range.

**Response fields.**

- `id: ID!` — `<tx-hash>-<log-index>`.
- `hash: Bytes!` — transaction hash.
- `amount: BigInt!` — transferred amount (wei).
- `tokenSymbol: String!`
- `from: Bytes!` — sender (lowercase).
- `to: Bytes!` — recipient (lowercase).
- `timestamp: BigInt!` — Unix seconds.

### NetworkValidator

**Description.** Registry of validator public keys. Subgraph only stores the key — for APR, income, and status of validators of a specific vault, use **backend GraphQL** `vaultValidators(...)` (see Endpoints above).

**Query example.**

```graphql
{
  networkValidators(first: 10) {
    id
  }
}
```

**Response fields.**

- `id: Bytes!` — validator public key.

**Validator performance (backend).** The subgraph stores only the public key. For per-validator APR, income, earnings, and beacon-chain status of one vault's validators, query the **backend** endpoint (`{net}-api.stakewise.io/graphql`):

```graphql
{
  vaultValidators(
    vaultAddress: "0xVAULT",
    statusNotIn: ["withdrawal_done"],
    first: 100,
    skip: 0
  ) {
    publicKey
    status
    apr
    income
    earned
    createdAt
  }
}
```

Arguments use backend syntax (direct on the query, not `where`): `vaultAddress` (lowercase), `statusIn` / `statusNotIn` (filter by beacon-chain status — pass `["withdrawal_done"]` to `statusNotIn` to drop exited validators), `first` / `skip` (paginate; large vaults have thousands of validators).

Response fields:
- `publicKey: String` — validator public key (hex).
- `status: ValidatorStatus` — beacon-chain status, e.g. `"active_ongoing"`, `"withdrawal_done"`.
- `apr: Decimal` — annualised return as a percent string (`"2.22"` = 2.22%); the SDK aliases this to `apy`. Use directly — do NOT multiply by 100.
- `income: Wei` — cumulative income (wei, 1e18).
- `earned: BigInt` — earned rewards (wei, 1e18).
- `createdAt: DateTime` — **ISO-8601 string** (`"2025-12-28T09:03:23+00:00"`), NOT Unix seconds. Backend timestamps are ISO; subgraph timestamps are Unix — don't mix them.

**Vault scoring / performance (backend).** Validator-duty performance for a vault — what the app's "Performance" tab shows. Backend only (`{net}-api.stakewise.io/graphql`):

```graphql
{
  scoringDetails(vaultAddress: "0xVAULT") {
    attestationsEarned
    attestationsMissed
    proposedBlockCount
    missedBlockCount
  }
}
```

- `attestationsEarned: Wei`, `attestationsMissed: Wei` — weighted attestation sums, 1e18-scaled — dimensionless performance weights, NOT ETH amounts despite the `Wei` type; use only as the ratio below. Attestation effectiveness = `earned / (earned + missed)` (e.g. `56.6e18 / (56.6e18 + 0.11e18)` ≈ 99.8%).
- `proposedBlockCount: Int`, `missedBlockCount: Int` — plain block counts.

The argument is direct (`vaultAddress`, lowercase), not a `where`.

**OFAC sanctions list (backend).** Addresses StakeWise screens against. Backend only, no arguments:

```graphql
{
  ofacAddresses
}
```

Returns `[String!]` (~90 addresses). **The list is checksummed (mixed-case)** — lowercase both sides before comparing to a user address: `ofac.map(a => a.toLowerCase()).includes(user.toLowerCase())`.

### V2Pool and V2PoolUser (legacy)

**Description.** V2 entities kept for migration support only. Skip unless the user explicitly asks about V2 / sETH2 / rETH2 leftovers.

**Query example.**

```graphql
{
  v2Pools(first: 1) {
    apy
    totalAssets
    rate
    migrated
    isDisconnected
  }
  v2PoolUsers(where: { id: "0xUSER" }) {
    balance
  }
}
```

**Response fields.**

`V2Pool` singleton:
- `apy`, `totalAssets`, `rate`, `migrated: Boolean`, `isDisconnected: Boolean`.

`V2PoolUser`:
- `id: ID!` — user address (lowercase).
- `balance: BigInt!` — V2 pool token balance (wei).

If `V2Pool.isDisconnected: true`, the pool is dead and not earning. Surface as "you have a remaining V2 balance; consider migrating via `app.stakewise.io`".

### UniswapPool and UniswapPosition

**Description.** LP positions on Uniswap V3 pools that pair a StakeWise token (osETH/ETH, SWISE/ETH, etc.). Use when the user asks about their LP positions on these pairs.

**Query example.**

```graphql
{
  uniswapPositions(where: { owner: "0xUSER" }) {
    id
    pool {
      id
      token0
      token1
      feeTier
    }
    amount0
    amount1
    liquidity
    tickLower
    tickUpper
  }
}
```

**Response fields.**

`UniswapPool`:
- `id: ID!` — pool contract address (lowercase).
- `token0: Bytes!`, `token1: Bytes!` — pair tokens.
- `feeTier: BigInt!` — 500 (0.05%), 3000 (0.3%), or 10000 (1%).
- `sqrtPrice: BigInt!` — current √price (Q64.96).
- `tick: Int` — current tick.
- `positions: [UniswapPosition!]!` — derived.

`UniswapPosition`:
- `id: ID!` — NFT tokenId.
- `owner: Bytes!`
- `pool: UniswapPool!`
- `amount0: BigInt!`, `amount1: BigInt!` — token amounts (wei).
- `tickLower: Int!`, `tickUpper: Int!` — range bounds.
- `liquidity: BigInt!`

## Units and gotchas

A one-screen cheat sheet for the data-query skill. Scan this **before** doing math on subgraph data — most "wrong number" mistakes start here.

### Numeric units

| Field shape | Unit | Example | How to use |
|---|---|---|---|
| `shares`, `assets`, `totalAssets`, `balance`, `*EarnedAssets`, `mintedOsTokenShares`, `exitingAssets`, `borrowedAssets`, `capacity` | **wei** (1e18) | `"1234500000000000000"` = 1.2345 ETH | Divide by 1e18. Use `BigInt`; never JS `Number` for arithmetic. |
| `apy`, `baseApy`, `extraApy`, `allocatorMaxBoostApy`, `Aave.borrowApy`, `Aave.supplyApy`, `osTokens.apy`, `*Snapshot.apy`, `PeriodicDistribution.apy` | **percent already** (decimal string) | `"2.71"` = 2.71% | Parse float, append `%`. Do NOT multiply by 100. |
| `Allocator.ltv`, `LeverageStrategyPosition.borrowLtv` | **decimal ratio 0..1** | `"0.903"` = 90.3% LTV | Multiply by 100 to display as percent. NOT consistent with `apy`. |
| `feePercent` | **basis points** | `1000` = 10%; `100` = 1% | Divide by 100. Range 0–10000. |
| `OsTokenConfig.ltvPercent`, `liqThresholdPercent`, `leverageMaxMintLtvPercent` | **percent × 1e16** | `"900000000000000000"` = 90% | Divide by 1e16. NOT basis points. |
| `Aave.leverageMaxBorrowLtvPercent` | **18-decimal fixed point** | `"929999998000000000"` ÷ 1e18 = 0.93 = 93% | Divide by 1e18 → 0..1 ratio. Different scale from `feePercent` and `OsTokenConfig.*Percent`. |
| `rate` (Vault, V2Pool) | wei per 1e18 shares | `"1050000000000000000"` = 1.05 assets per share | `userAssets = userShares × rate / 1e18`. |
| `ExchangeRate.osTokenAssetsRate` | decimal string | `"0.96"` = 1 osETH share is worth 0.96 ETH | Multiply osToken share count by rate. |
| `ExchangeRate.assetsUsdRate`, `*UsdRate` | decimal string | `"1850.5"` = $1850.50 per 1 ETH (GNO on Gnosis) | Multiply asset amount (in human units after wei division) by rate. |
| `Checkpoint.timestamp`, `ExitRequest.timestamp`, `ExitRequest.withdrawalTimestamp`, `AllocatorAction.createdAt`, `Vault.createdAt`/`rewardsTimestamp`/`lastFeeUpdateTimestamp`, `PeriodicDistribution.startTimestamp`/`endTimestamp` | **Unix seconds** | `1778570771` | Compare with `Math.floor(Date.now() / 1000)`. |
| `VaultSnapshot.timestamp`, `AllocatorSnapshot.timestamp`, `ExchangeRateSnapshot.timestamp`, `ExchangeRateStats.timestamp` | **microseconds** (Unix seconds × 1e6) | `1778457600000000` = 2026-05-11 00:00:00 UTC | Snapshots are at exact UTC 00:00 daily. For range filters: `timestamp_gte: (Math.floor(Date.now()/1000) - N*86400) * 1e6`. |
| `chainId` | integer | `1`, `100`, `560048` | Plain JS number. |

### BigInt is a string in JSON

Every `BigInt!` schema field comes back as a **string**: `{ "totalAssets": "1234567890123456789" }`. Always `BigInt(value)` before arithmetic; `String(big)` when assembling display text. JS `Number` loses precision past `Number.MAX_SAFE_INTEGER` (≈ 9 × 10^15), well below normal vault TVL in wei.

### Addresses must be lowercase

Filter values for `where: { address, vault, user, receiver, owner }` MUST be lowercase hex. The subgraph stores all addresses as lowercase. A mixed-case query returns empty results without an error.

```js
const addr = userInput.toLowerCase()
```

### Dust positions (< 0.0001 ETH/GNO) — UI hides them, subgraph keeps them

The app hides any balance / mint / reward below `0.0001` ETH/GNO (`1e14` wei) — it **displays as 0**, even though the subgraph stores the real value.

For the skill: surface the real value, but annotate when below the threshold — "you have N wei (~0.00009 ETH); the app rounds this to 0 for display, but the protocol still tracks it."

### APY is weekly-averaged and already annualised

`Vault.apy`, `Allocator.apy`, `*Snapshot.apy`, `PeriodicDistribution.apy` are server-computed weekly averages, already annualised, already in **percent** as a decimal string (e.g. `"2.714"` = 2.71%). Use directly — do NOT multiply by 100, do NOT re-annualise.

### LtvStatus is precomputed; HF you compute manually

`Allocator.ltvStatus` is an enum `Healthy | Moderate | Risky | Unhealthy` already calculated server-side using `mintedOsTokenShares` and the vault's `liqThresholdPercent`. Prefer it over computing health factor unless the user wants a numerical HF:

```
HF = (stakedAssets × liqThresholdPercent / 1e18) / mintedAssetsValue
mintedAssetsValue = mintedOsTokenShares × osTokenAssetsRate
```

Status mapping: HF ≥ 1.02 → Healthy · ≥ 1.01 → Moderate · ≥ 1.00 → Risky · < 1.00 → Unhealthy.

### Gnosis quirks

| Issue | Workaround |
|---|---|
| No fiat rates in Gnosis subgraph | Fetch from **Mainnet** subgraph — fiat rates are global. |
| No leverage strategy deployed | `leverageStrategyPositions` / `aavePositions` are empty; the `Aave` singleton reads all-zero. Boost questions on Gnosis → "leverage is not available on Gnosis Chain". |
| `VaultType.PrivateMetaVault` not supported | Skip private meta-vault paths on Gnosis. |
| **osGNO USD conversion MUST use Mainnet `osTokenAssetsRate`** | Formula: `osGNO_USD = mintedShares × Mainnet.osTokenAssetsRate × Gnosis.assetsUsdRate` (GNO→USD). The app always reads `osTokenAssetsRate` from the **Mainnet** subgraph and swaps only the per-chain base-asset USD price; Gnosis's own `osTokenAssetsRate` is never used and currently differs by ~7–8%. |

### Backend blacklist — fetch once, exclude from answers

The subgraph indexes every vault, including ones the UI hides via a backend-only flag the subgraph does NOT mirror. Before any vault-discovery / marketplace answer, fetch the blacklist from backend GraphQL and **exclude blacklisted vaults**.

Against the **backend** endpoint (`{net}-api.stakewise.io/graphql`):

```graphql
{
  vaults(
    blacklisted: true,
    first: 1000
  ) {
    id
  }
}
```

Note the backend syntax: arguments go **directly** on the `vaults(...)` query (`blacklisted: true`, `first: 1000`), NOT inside a `where: { ... }` filter. That `where:` form is subgraph-only. Run it against both `mainnet-api.stakewise.io/graphql` and `gnosis-api.stakewise.io/graphql`.

Cache the resulting `id` list per network for the conversation, then filter subgraph results client-side: `subgraphVaults.filter(v => !blacklist.has(v.id))`. If the user asks about a specific blacklisted vault by address, surface the data anyway with a note ("the app hides this vault as blacklisted — here's the on-chain truth"); do not silently drop direct lookups.

For `hidden: true` / `verified: true` flags use the same backend endpoint with the appropriate direct argument (`hidden: true`, etc.).

The same backend `vaults(...)` query also exposes `mevMissed: Wei` — the cumulative ETH a vault failed to capture from missed MEV (wei, 1e18). Fetch it by id: `{ vaults(id: "0xVAULT") { mevMissed } }`. Use for "has my vault lost MEV rewards?"; `"0"` means none missed.

### Verify unknown fields via introspection

If the user asks about a field that is not listed in any entity section above, do NOT guess — verify against the live schema before using it. Subgraph GraphQL endpoints support introspection; per-type queries are cheap (~5–8 KB per response, ~70 fields for `Vault`).

```graphql
{
  __type(name: "Vault") {
    fields {
      name
      type {
        name
        kind
        ofType {
          name
          kind
        }
      }
    }
  }
}
```

Replace `"Vault"` with the entity name in question (`Allocator`, `LeverageStrategyPosition`, `DistributorClaim`, `VestingEscrow`, …). The response lists every field currently deployed on prod plus its type. If the field the user asked about is missing from the result, say so honestly to the user — do not invent it. If the field exists, use it once and quote its real type.

Backend GraphQL also supports introspection (same shape). Use the same procedure against `{net}-api.stakewise.io/graphql` when you need to verify a backend-only field (e.g. vault flags, scoring breakdown).

Prefer per-type introspection over the full `__schema` query — the full dump is ~150 KB and burns context for no extra signal.

## Blog articles

Cite the exact URL from the table below — do NOT paraphrase or summarise article content from training data; link to the canonical post and let the user open it. If a topic isn't listed, suggest a `blog.stakewise.io` search; never invent a URL.

**DeFi: borrow against osETH**

| Protocol | URL |
|---|---|
| Aave | https://blog.stakewise.io/guide/use-oseth-to-borrow-on-aave-why-and-how-to-do-it |
| Compound | https://blog.stakewise.io/guide/use-oseth-to-borrow-on-compound-why-and-how-to-do-it |
| Morpho Blue | https://blog.stakewise.io/guide/borrow-eth-with-oseth-on-morpho-blue-how-and-why-to-do-it |
| Fluid | https://blog.stakewise.io/guide/how-to-use-oseth-on-fluid-protocol-a-complete-guide |
| Gravita (borrow GRAI) | https://blog.stakewise.io/guide/borrow-grai-with-oseth-on-gravita-protocol-how-and-why-to-do-it |

**DeFi: liquidity provision**

| Pool | URL |
|---|---|
| Balancer boosted osETH/ETH (Mainnet) | https://blog.stakewise.io/guide/oseth-liquidity-boosted-oseth-eth-pool-on-balancer |
| Balancer osETH/ETH (Arbitrum) | https://blog.stakewise.io/guide/liquidity-on-arbitrum-oseth-eth-pool-on-balancer |
| Curve osETH/rETH | https://blog.stakewise.io/guide/oseth-liquidity-oseth-reth-on-curve |
| Ramses osETH/wstETH (Arbitrum) | https://blog.stakewise.io/guide/liquidity-on-arbitrum-oseth-wsteth-pool-on-ramses |
| ETH/SWISE | https://blog.stakewise.io/guide/swise-liquidity-eth-swise |

**Restaking and leveraged strategies**

| Strategy | URL |
|---|---|
| EigenLayer | https://blog.stakewise.io/guide/restake-oseth-on-eigenlayer-how-to-do-it-and-what-to-expect |
| Symbiotic | https://blog.stakewise.io/guide/restake-oseth-on-symbiotic-why-and-how-to-do-it |
| Gearbox leveraged osETH/wETH loop | https://blog.stakewise.io/guide/leveraged-oseth-weth-looping-strategy-on-gearbox |

**Cross-chain**

| Topic | URL |
|---|---|
| Bridging osETH to Arbitrum | https://blog.stakewise.io/guide/bridging-oseth-to-arbitrum-how-and-why-to-do-it |

**Case studies and conceptual deep-dives**

| Topic | URL |
|---|---|
| osETH overcollateralisation deep-dive | https://blog.stakewise.io/caseStudy/what-is-oseth-a-deep-dive-into-the-overcollateralized-staked-ether-token-of |
| StakeWise V3 vision and economics ("bespoke staking") | https://blog.stakewise.io/caseStudy/earn-more-eth-with-bespoke-staking-stakewise-v3 |
| MetaMask Pooled Staking integration | https://blog.stakewise.io/caseStudy/how-metamask-launched-pooled-staking-with-stakewise |
| NodeSet integration | https://blog.stakewise.io/caseStudy/how-nodeset-launched-decentralized-pooled-staking-with-stakewise |
| Boost yield amplification strategy | https://blog.stakewise.io/caseStudy/stakewise-boost-a-defi-native-yield-amplification-strategy-made-simple |

**Product updates and announcements**

| Topic | URL |
|---|---|
| MetaVaults launch (permissionless, nested, ERC-20 variants) | https://blog.stakewise.io/productUpdate/meta-vaults-in-different-flavors-now-open-to-everyone |
| Vaults v4.0 (Pectra-ready, EIP-7251 / EIP-7002) | https://blog.stakewise.io/productUpdate/vaults-v4-0-optional-upgrade-now-available |
| StakeWise V3 announcement | https://blog.stakewise.io/announcement/stakewise-v3-announcement |
