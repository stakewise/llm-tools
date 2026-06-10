# Minting and rates entities

osToken-related entities: who holds osETH/osGNO, per-vault minting risk parameters, the global osToken stats singleton, osToken redemption queue, and current exchange rates between assets and USD/EUR/etc. Use for "how much osETH can I mint here?", "what's the osToken supply?", "what's the osETH→USD rate?", "what's my redemption status?".

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
