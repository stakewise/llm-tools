---
title: Units and gotchas
description: Numeric units, address formats, indexing lag, network-specific quirks for the StakeWise V3 data-query skill.
---

# Units and gotchas

A one-screen cheat sheet. Read this **before** doing math on subgraph data — most "wrong number" mistakes start here.

## Numeric units

| Field shape | Unit | Example | How to use |
|---|---|---|---|
| `shares`, `assets`, `totalAssets`, `balance`, `*EarnedAssets`, `mintedOsTokenShares`, `exitingAssets`, `borrowedAssets`, `capacity` | **wei** (1e18) | `"1234500000000000000"` = 1.2345 ETH | Divide by 1e18 to get human ETH/GNO. Never coerce to JS `Number` for math — use `BigInt` or string division. |
| `apy`, `baseApy`, `extraApy`, `allocatorMaxBoostApy`, `Aave.borrowApy`, `Aave.supplyApy`, `osTokens.apy`, `PeriodicDistribution.apy`, `VaultSnapshot.apy`, `AllocatorSnapshot.apy` | **percent already** (decimal string) | `"2.71"` = 2.71% | Parse as float and append `%` — do NOT multiply by 100. Verified against `Vault.apy = "2.714..."` on prod (Genesis ≈ 2.7% APY, not 271%). |
| `Allocator.ltv`, `LeverageStrategyPosition.borrowLtv` | **decimal ratio 0..1** | `"0.903"` = 90.3% LTV | Multiply by 100 to display as percent. Different format from `apy` — they are NOT consistent in the schema. |
| `feePercent` | **basis points** | `1000` = 10%; `100` = 1% | Divide by 100 to get percent. Range 0–10000. |
| `OsTokenConfig.ltvPercent`, `liqThresholdPercent`, `leverageMaxMintLtvPercent` | **percent × 1e16** (wei-style percent) | `"900000000000000000"` = 90% | Divide by 1e16 to get percent (e.g. `900000000000000000 / 1e16 = 90`). NOT basis points — easy to confuse. |
| `rate` (Vault, V2Pool) | wei per 1e18 shares | `"1050000000000000000"` = 1.05 assets per share | `userAssets = userShares × rate / 1e18`. |
| `ExchangeRate.osTokenAssetsRate` | decimal string | `"0.96"` = 1 osETH share is worth 0.96 ETH | Multiply osToken share count by rate. |
| `ExchangeRate.assetsUsdRate`, `*UsdRate` | decimal string | `"1850.5"` = $1850.50 per 1 unit | Multiply asset amount (in human units after wei division) by rate to get USD. |
| `Checkpoint.timestamp`, `ExitRequest.timestamp`, `ExitRequest.withdrawalTimestamp`, `AllocatorAction.createdAt`, `Vault.createdAt`, `Vault.rewardsTimestamp`, `Vault.lastFeeUpdateTimestamp`, `PeriodicDistribution.startTimestamp`/`endTimestamp` | **Unix seconds** | `1778570771` | Compare with `Math.floor(Date.now() / 1000)`. Multiply by 1000 for `new Date(...)`. |
| **`VaultSnapshot.timestamp`, `AllocatorSnapshot.timestamp`, `ExchangeRateSnapshot.timestamp`, `ExchangeRateStats.timestamp` (Timestamp scalar)** | **microseconds** (Unix seconds × 1e6) | `1778457600000000` = `1778457600` Unix seconds = **2026-05-11 00:00:00 UTC** | Verified empirically on Genesis vault — snapshots take place at exact **UTC 00:00 daily** (diff between consecutive snapshots is `86_400_000_000` µs = 24h flat). For range filters: `timestamp_gte: (Math.floor(Date.now()/1000) - N*86400) * 1e6`. Convert to JS Date: `new Date(Number(ts) / 1000)`. SDK divides by 1e6 to get seconds, 1e3 to get milliseconds. |
| `Aave.leverageMaxBorrowLtvPercent` | **18-decimal fixed point** (NOT basis points) | `"929999998000000000"` ÷ 1e18 = `0.93` = 93% | Divide by 1e18 to get a 0..1 ratio. Different scale from `feePercent` (bps) and from `OsTokenConfig.*Percent` (1e16). Verified empirically on prod Aave singleton. |
| `chainId` | integer | `1`, `100`, `560048` | Plain JS number. |

## BigInt is a string in JSON

Every `BigInt!` schema field comes back as a **string**:

```json
{ "totalAssets": "1234567890123456789", "shares": "987654321..." }
```

Always `BigInt(value)` before arithmetic; the inverse is `String(big)` when assembling display text. JS `Number` loses precision after ~9 quadrillion (Number.MAX_SAFE_INTEGER = 2^53 - 1), which is well below normal vault TVL in wei.

## Addresses must be lowercase

Filter values for `where: { address, vault, user, receiver, owner }` MUST be lowercase hex. The subgraph stores all addresses as lowercase. A mixed-case query returns empty results without an error.

```graphql
# Bad — returns []
allocators(where: { address: "0xAbCdEf..." })

# Good
allocators(where: { address: "0xabcdef..." })
```

JS:
```js
const addr = userInput.toLowerCase()
```

## Composite IDs

Some entities use composite IDs joined by `-`:

| Entity | ID format | Example |
|---|---|---|
| `Allocator` | `<vault>-<address>` (both lowercase) | `0x111...-0xaaa...` |
| `LeverageStrategyPosition` | `<vault>-<user>` | `0x111...-0xaaa...` |
| `ExitRequest` | `<vault>-<positionTicket>` | `0x111...-1234` |
| `OsTokenExitRequest` | `<vault>-<positionTicket>` | `0x111...-5678` |
| `RewardSplitterShareHolder` | `<splitter>-<address>` | `0xss...-0xaaa...` |
| `DistributorReward` | `<token>-<user>` | `0xtt...-0xaaa...` |
| `Vault`, `OsTokenConfig` | vault address only | `0x111...` |
| `OsTokenHolder`, `UserIsContract`, `V2PoolUser`, `AavePosition`, `DistributorClaim` | user address only | `0xaaa...` |

When **filtering** prefer `where: { vault: "...", address: "..." }` over `id: "...-..."` — filters are forgiving and the schema does the join for you.

## Dust positions (< 0.0001 ETH/GNO) — UI hides them, subgraph keeps them

Frontend uses `minimalAmount = 100_000_000_000_000n` wei (= 0.0001 ETH/GNO) as the cut-off. Any balance / mint / reward below this threshold is **displayed as 0** in the app, even though the subgraph stores the real value. Source: `frontwise/packages/sw-helpers/constants/blockchain.ts` and usage in `apps/web/src/hooks/vault/useUser/useBalances/`.

For the skill: surface the real value, but annotate when < 0.0001 — "you have N wei (~0.00009 ETH); the app rounds this to 0 for display but the protocol still tracks it." Same applies to dust positions appearing in the Deposits tab as `Deposit: 0.00` while subgraph shows assets = 1 wei (we saw this on `0x9eeb6be...` and `H2O Nodes (DEPRECATED)` Gnosis cards).

## Hidden vaults — TWO sources

The skill already documents backend `vaults(blacklisted: true)`. The frontend **also** has a **hardcoded** client-side hidden list at `frontwise/apps/web/src/helpers/hiddenVaults.ts:5-17` for specific meta-vaults that aren't backend-blacklisted but the app deliberately doesn't surface. Subgraph indexes them; skill can answer about them; warn the user if you suspect the address is in this list.

## Lifetime earnings can be NEGATIVE

`Allocator.totalEarnedAssets`, `totalStakeEarnedAssets`, `totalBoostEarnedAssets` are signed `BigInt`s that **can return as negative strings** (e.g. `"-170381003445038367"`) when the user has been slashed or accrued penalty. The UI on `app.stakewise.io` typically hides or clamps these to zero — the skill should surface the real signed value and explain "this position has lost N ETH lifetime, likely due to validator slashing penalty". Never `Math.max(0, ...)` before showing the user — it lies about real economics. Same applies to per-snapshot `earnedAssets` in `AllocatorSnapshot`.

## Subgraph vs backend: blacklist / hidden / verified flags

The subgraph indexes **every vault**, including ones the UI deliberately hides. The UI checks a **backend-side flag set** that the subgraph does NOT mirror:

| Backend flag | UI behaviour | Detect via |
|---|---|---|
| `blacklisted: true` | `/vault/<network>/<addr>` redirects to `/vaults`. Marketplace card may still appear by truncated address with `Deposit: 0.00`. | Backend GraphQL `vaults(id) { blacklisted }` |
| `hidden: true` | Vault is hidden from the marketplace list, but detail page may still open. | Backend GraphQL `vaults(id) { hidden }` |
| `verified: true` | UI shows a "verified" badge / checkmark. Inverse `verified: false` is the default — no extra UI penalty. | Backend GraphQL `vaults(id) { verified }` |

**Backend query** (example for Mainnet):

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ vaults(id:\"0x...\") { id blacklisted hidden verified } }"}' \
  https://mainnet-api.stakewise.io/graphql
```

If the user is surprised by a "the app doesn't open this vault" symptom, run this query first — flag is almost always `blacklisted: true` (we verified on `0x4fef9d741011476750a243ac70b9789a63dd47df`: `blacklisted: true`, while Genesis returns `blacklisted: false, verified: true`).

The skill should **show** the data the subgraph holds (transparent), but **annotate** that the UI flags the vault — users get full information plus context for the UI discrepancy.

## APY is weekly-averaged and already annualised

`Vault.apy`, `Allocator.apy`, `*Snapshot.apy`, `PeriodicDistribution.apy` are server-computed weekly averages, already annualised, and already in **percent** as a decimal string (e.g. `"2.714"` = 2.71%). Use them directly — do NOT multiply by 100 (that would give 271%), and do NOT re-annualise. See the Numeric units table above for the full list of percent-vs-decimal fields.

## LtvStatus is precomputed; HF you compute manually

`Allocator.ltvStatus` is an enum `Healthy | Moderate | Risky | Unhealthy` already calculated server-side using current `mintedOsTokenShares` and the vault's `liqThresholdPercent`. Prefer this over computing health factor unless the user wants a precise numerical HF.

If they do want the number:

```
HF = (stakedAssets × liqThresholdPercent / 1e18) / mintedAssetsValue
```

Where `mintedAssetsValue = mintedOsTokenShares × osTokenAssetsRate`. Status mapping:
- HF ≥ 1.02 → Healthy
- HF ≥ 1.01 → Moderate
- HF ≥ 1.00 → Risky
- HF < 1.00 → Unhealthy

Boost borrow status uses different thresholds — see "Two different LTVs" section below.

## Two different "LTV"s — don't confuse them

StakeWise has two unrelated LTV metrics. They share the abbreviation but measure different positions, have different liquidation thresholds, and live on different protocols.

### 1. osToken LTV (`Allocator.ltv`) — in StakeWise vault

- **Numerator**: `mintedOsETH_value`
- **Denominator**: `stakedETH` in the vault
- **Liquidation threshold**: `OsTokenConfig.liqThresholdPercent` per vault, typically ~92%
- **What it measures**: "how much osETH did you mint against your stake"
- **Recipe**: 4 (mint capacity + health factor)
- **Already-computed status**: `Allocator.ltvStatus` enum (Healthy / Moderate / Risky / Unhealthy)
- **Liquidation party**: StakeWise vault contract liquidates your osToken position if breached

### 2. Borrow LTV (`LeverageStrategyPosition.borrowLtv`) — in Aave, only when Boost is active

- **Numerator**: `borrowedETH` from Aave
- **Denominator**: `suppliedOsETH × osTokenAssetsRate` (osETH supplied to Aave as collateral)
- **Liquidation threshold**: Aave's market threshold for osETH ≈ **94.5%**
- **What it measures**: "how leveraged is your Boost position" — independent of osToken vault LTV
- **Recipe**: 5 (boost position + borrow status)
- **SDK thresholds** (intentionally stricter than Aave's 94.5% to give a warning buffer):

  | borrowLtv | Status | Why |
  |---|---|---|
  | ≤ 0.938 | Healthy | ~0.7% buffer below Aave's 0.945 |
  | 0.938 – 0.945 | Moderate | early warning, Aave's threshold imminent |
  | > 0.945 | Risky | already at / past Aave threshold, liquidation can fire |

- **Liquidation party**: Aave's lending market liquidates the leverage proxy if breached
- **Format**: decimal ratio 0..1 (e.g. `"0.9311"` = 93.11%) — multiply by 100 for percent display

### Boost mechanics in 3 sentences

When a user boosts:
1. SDK supplies their osETH to Aave as collateral (this is `AavePosition.suppliedOsTokenShares`)
2. Aave lends back ETH up to its LTV cap (this is `AavePosition.borrowedAssets`)
3. That borrowed ETH is restaked into the vault, looping until the target leverage is reached

The user simultaneously has BOTH LTVs:
- osToken LTV — their original vault position
- Borrow LTV — the Aave-side loan keeping the leverage loop alive

A user can have **Healthy osToken LTV (e.g. 65%) AND Risky borrow LTV (e.g. 94%)** at the same time. Surface both, and explain which liquidation triggers first if asked.

## Indexing lag (1–5 seconds after a tx)

The subgraph is **eventually consistent**. Right after a deposit/withdraw/mint, queries can return stale data for ~1–5 seconds while The Graph indexes the new block. Use the `Checkpoint` entity to detect lag:

```graphql
{ checkpoints(first:1, orderBy: timestamp, orderDirection: desc) { id timestamp } }
```

Compare `timestamp` to `Math.floor(Date.now() / 1000)`. If the gap is > 30 seconds, indexing is stalled — surface this to the user. If a user says "I just deposited and don't see it", suggest a 10-second retry.

## Gnosis quirks

| Issue | Workaround |
|---|---|
| No fiat rates (`usdToEurRate`, `usdToGbpRate`, …) in Gnosis subgraph | Fetch from **Mainnet** subgraph — fiat rates are global, the cross-chain price is acceptable. |
| No leverage strategy deployed | `LeverageStrategyPosition` / `Aave` / `AavePosition` queries return empty. Boost questions on Gnosis → "leverage is not available on Gnosis Chain". |
| Some meta vault features differ | `VaultType.PrivateMetaVault` not supported on Gnosis. Vault `vaultToken` ERC20 share token unavailable for meta vaults. |
| **osGNO USD conversion MUST use Mainnet `osTokenAssetsRate`** | Verified twice on `app.stakewise.io/vault/gnosis/<addr>`: `osGNO_USD = mintedShares × Mainnet.osTokenAssetsRate (~1.0710) × Gnosis.assetsUsdRate ($131.41)`. This is the **canonical formula** confirmed by the StakeWise team — not a UI quirk. The Gnosis subgraph's `osTokenAssetsRate` (~1.1480) is internal/legacy and should NOT be used for user-facing USD value display; doing so gives ~7% inflated figures vs the app. Fetch the rate field from Mainnet subgraph for any osGNO/osETH USD math even when answering Gnosis questions. |

## Pagination

Subgraph default `first` = 100, max = 1000. Always set `first` explicitly:

```graphql
allocators(first: 50, skip: 0, where: {...}) { ... }
```

`AllocatorSnapshot` and `VaultSnapshot` have a **client-side cap of 1000 days** (per SDK convention) — if the user asks for a longer range, page in chunks.

## V2 vs V3

V2 is legacy (`sETH2`/`rETH2`), still indexed for migration purposes only:

- `V2Pool.isDisconnected = true` → pool is dead; skip unless explicitly asked.
- `V2PoolUser` → user's leftover V2 balance.
- `ExitRequest.isV2Position = true` → exit request from a V2 vault.
- For all live data, the V3 entities (`Vault`, `Allocator`, etc.) are what you want.

## Null fields

Many fields are nullable — always handle the absence:

- `Allocator.ltv` is `"0"` when the user hasn't minted osETH. `ltvStatus` defaults to `Healthy`.
- `LeverageStrategyPosition.exitRequest` is `null` if not exiting.
- `Vault.mevEscrow` is `null` when the vault uses the **smoothing pool** (shared MEV). Non-null = vault's own escrow.
- `Vault.tokenName`, `tokenSymbol` are null for non-ERC20 vaults (check `isErc20`).
- `Vault.feeRecipient` can equal `admin` if not configured separately.

## Rate-limiting

The hosted subgraph has soft rate limits (not documented publicly, but observed ~1 query/sec sustained is safe). For a single user question, you'll fire 1–3 queries — no problem. **Never** poll inside a single conversation turn.

## DistributorClaim arrays are parallel — index together

`DistributorClaim.tokens`, `cumulativeAmounts`, `unclaimedAmounts` are three same-length arrays where `tokens[i]` ↔ `cumulativeAmounts[i]` ↔ `unclaimedAmounts[i]` describe one merkle reward entry. Empty arrays mean nothing claimable. **Never** sum across tokens — they're different ERC20s; surface a per-token line.

## Vesting math: trust the contract, don't compute claimable yourself

`VestingEscrow.unclaimedAmount()` on the escrow contract already handles cliff, end-of-vesting, and pause logic correctly. Just call it. Manually computing `total × (now − start) / (end − start) − claimed` will diverge from the contract when:
- `paused() == true` (contract returns 0; your math returns linear interpolation)
- `now < startTime + cliffLength` (contract returns 0; your math may return positive)
- The contract has been disabled mid-vesting (rare admin action)

See `rpc-fallback.md` for the canonical selectors.

## Keccak-256 vs SHA3-256 — pick the right hash

Ethereum function selectors are the **first 4 bytes of keccak-256** of the canonical signature. Python's stdlib `hashlib.sha3_256` is **NOT** keccak — they differ by a one-byte padding constant. If you compute selectors with `hashlib.sha3_256` you'll get values that look correct but call into wrong functions (or revert). Use `eth_utils.keccak`, `web3.Web3.keccak`, `pysha3.keccak_256`, `ethers.id`, or `cast keccak`. Known good selectors are bundled in `rpc-fallback.md`.

## Backend `vaults(blacklisted)` is the only authoritative hidden-vault detector

The subgraph indexes every vault. The UI hides three categories independently — only the **backend GraphQL** exposes them:

1. `blacklisted: true` — vault detail page redirects to `/vaults`; this is what `app.stakewise.io` calls "Invalid Vault".
2. `hidden: true` — vault is omitted from the marketplace list but the detail page may still open.
3. Hardcoded `hiddenVaults.ts` list — bundled in the frontend repo, not in any data source. Limited to a few meta-vault constructions the app deliberately doesn't display. Subgraph + backend both still index them.

When the user reports "the app doesn't show this vault", run `vaults(id: "0x...") { blacklisted hidden verified }` on the backend before suspecting a data-pipeline bug.

## When in doubt

If a numeric value looks off by 10^16 or 10^18, you almost certainly mixed up wei-vs-percent vs basis points. Re-read the field row in the table above.
