# Position entities

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
- `withdrawalTimestamp: BigInt` — backend-estimated ETA in Unix seconds; nullable. When null, fall back to `Vault.avgExitQueueLength` (backend) or backend `exitStats.duration` for a network-wide average.
- `isClaimable: Boolean!`
- `isClaimed: Boolean!`
