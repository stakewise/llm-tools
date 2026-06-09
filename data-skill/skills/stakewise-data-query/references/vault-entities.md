# Vault entities

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
- `displayName: String` — human name from IPFS metadata; null if not set.
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
