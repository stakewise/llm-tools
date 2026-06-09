# Rewards entities

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
