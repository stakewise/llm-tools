# Network and misc entities

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
