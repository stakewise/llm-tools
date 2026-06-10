# Boost entities

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
