# Units and gotchas

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
