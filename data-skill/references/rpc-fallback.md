---
title: Public RPC fallback — on-chain reads without user setup
description: How to make eth_call against StakeWise contracts using public RPC nodes (rotation + dynamic discovery via chainid.network).
---

# Public RPC fallback

When the subgraph cannot answer (osToken share↔asset conversion, current rate, exact max-mintable shares, vesting unlock schedule, Aave strategy proxy lookup), the skill falls back to JSON-RPC `eth_call` against a **public** Ethereum / Gnosis / Hoodi node. The user does NOT need to bring their own RPC URL.

## Two-tier strategy

### Tier 1 — bundled public RPC list (try first)

| Network | Chain ID | Bundled URLs (try in order, fall back on 429/5xx/timeout) |
|---|---|---|
| Mainnet | 1 | `https://ethereum-rpc.publicnode.com` → `https://eth.llamarpc.com` → `https://rpc.ankr.com/eth` |
| Gnosis | 100 | `https://rpc.gnosischain.com` → `https://gnosis-rpc.publicnode.com` → `https://rpc.ankr.com/gnosis` |
| Hoodi | 560048 | `https://rpc.hoodi.ethpandaops.io` (canonical testnet RPC; falls back via chainid.network if needed) |

All accept POST with `content-type: application/json`, no API key, CORS open.

### Tier 2 — dynamic discovery (when all bundled URLs fail)

If every URL in tier 1 returns an error for the user's chain:

1. Fetch the chain manifest from chainid.network:
   ```
   https://chainid.network/chains/eip155-{chainId}.json
   ```
   (`eip155-1.json` for Mainnet, `eip155-100.json` for Gnosis, `eip155-560048.json` for Hoodi.) ~5–10 KB JSON.

2. Parse `chain.rpc[]`. Filter out:
   - URLs containing `${...}` (template placeholders requiring API keys)
   - URLs with `wss://` prefix (websocket, not what we want)
   - URLs with `tracking != "none"` if you want maximum privacy (optional)

3. Probe candidates with a cheap `eth_chainId` call. The first one whose response `result` equals the expected chain ID (hex) is your new working RPC. Cache it in memory for the rest of the conversation.

4. If no candidate works either → tell the user honestly: **"All public RPC nodes for chain N are currently unreachable. Try again in a minute, or supply your own RPC URL."**

## Request shape

`eth_call` template (POST body):

```json
{
  "jsonrpc": "2.0",
  "method": "eth_call",
  "params": [
    {
      "to": "<CONTRACT_ADDRESS>",
      "data": "0x<FUNCTION_SELECTOR><ABI_ENCODED_ARGS>"
    },
    "latest"
  ],
  "id": 1
}
```

Liveness probe (no params):

```json
{ "jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 1 }
```

A healthy node returns `{ "jsonrpc": "2.0", "id": 1, "result": "0x1" }` for Mainnet (`0x64` Gnosis, `0x88bb0` Hoodi).

## Computing function selectors

Function selector = first 4 bytes of **keccak-256** hash of the canonical signature `"name(arg1Type,arg2Type)"`.

**WARNING:** Python's `hashlib.sha3_256` is NOT keccak-256 — they're different hash functions (NIST SHA-3 added a padding byte that Ethereum's Keccak doesn't have). Use a true Keccak implementation:
- CLI: `cast keccak "feePercent()"` (Foundry) — preferred.
- Python: `eth_utils.keccak`, `web3.Web3.keccak`, `pysha3.keccak_256`.
- Node: `viem.keccak256(toBytes("feePercent()"))` or `ethers.id("feePercent()")` (first 10 chars including 0x).

All selectors below are verified against live Mainnet contracts.

## Contract addresses (Mainnet)

| Contract | Address | Purpose |
|---|---|---|
| MintTokenController (osETH) | `0x2A261e60FB14586B474C208b1B7AC6D0f5000306` | osETH share↔asset conversion, fee, reward rate |
| OsTokenVaultEscrow (osETH unstake) | look up via SDK `config.contracts.tokens.osTokenVaultEscrow` | osToken exit queue |
| Keeper | look up via SDK `config.contracts.base.keeper` | `canHarvest`, `isCollateralized` |
| LeverageStrategy V2 | look up via SDK `config.contracts.base.leverageStrategyV2` | `getStrategyProxy(vault, user)` for boost lookup |
| osETH token (ERC20) | `0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38` | `balanceOf(user)`, transfers |
| SWISE token (ERC20) | `0x48C3399719B582dD63eB5AAdF12A40B4C3f52FA2` | SWISE balance |

For Gnosis and Hoodi, cross-reference `@stakewise/v3-sdk` `src/helpers/configs/{gnosis,hoodi}.ts`. The mintTokenController address is **different per network** — never reuse Mainnet's on Gnosis.

## Verified function selectors and ABIs

All selectors below are **measured** against live contracts on Mainnet (2026-05-12).

### MintTokenController — osETH math

| Function | Selector | Args | Returns | Notes |
|---|---|---|---|---|
| `convertToAssets(uint256 shares)` | `0x07a2d13a` | shares: uint256 wei | uint256 assets in wei | Current osETH→ETH rate. 1 osETH = ~1.0710 ETH today. |
| `convertToShares(uint256 assets)` | `0xc6e6f592` | assets: uint256 wei | uint256 shares in wei | Inverse. |
| `feePercent()` | `0x7fd6f15c` | — | uint256 (bps) | Returns 500 = 5% protocol fee. |
| `avgRewardPerSecond()` | `0x8d7d4520` | — | uint256 (wei/sec) | E.g. `0x2d57c986` = 762378118 wei/sec on Mainnet. Used in max-mint buffer formula. |
| `cumulativeMintShares(address,uint256)` | `0x6a0b1987` | vault, ? | uint256 | Internal accounting. Rarely needed. |

Worked example — "How much ETH is 1 osETH right now?" on Mainnet:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x2A261e60FB14586B474C208b1B7AC6D0f5000306","data":"0x07a2d13a0000000000000000000000000000000000000000000000000de0b6b3a7640000"},"latest"],"id":1}' \
  https://ethereum-rpc.publicnode.com
```

Response: `0x0edcd433fce9b208` → `1.071079...` × 1e18 wei → **1 osETH ≈ 1.0710 ETH**.

### Encoding tip

For a single `uint256` arg, ABI encoding is just a 32-byte left-padded hex:
- `1e18` (1 ether) = `0000000000000000000000000000000000000000000000000de0b6b3a7640000`
- `100e18` (100 ether) = `0000000000000000000000000000000000000000000000056bc75e2d63100000`

Concatenate after the 4-byte selector. Example: `0x07a2d13a` + `0000…de0b6b3a7640000` = full calldata for `convertToAssets(1e18)`.

### VestingEscrow — claimable schedule

Each user's vesting escrow is a **separate proxy contract** at a unique address. Subgraph stores only `{ id, token, recipient }` — for the schedule and amounts you MUST call the escrow.

Implementation: `0x1e6d872ce26c8711e7d47b8e0c47ab91d95a6df3` on Mainnet (Solidity 0.7.5, verified). Proxies are EIP-1167 minimal proxies (45 bytes of bytecode).

| Function | Selector | Returns | Notes |
|---|---|---|---|
| `totalAmount()` | `0x1a39d8ef` | uint256 wei | Full grant size. |
| `vestedAmount()` | `0x44b1231f` | uint256 wei | Already vested per linear-with-cliff schedule. |
| `claimedAmount()` | `0x9668ceb8` | uint256 wei | Already withdrawn by recipient. |
| `unclaimedAmount()` | `0x6efce095` | uint256 wei | `vested - claimed`. **Use this directly** — no need to compute it yourself. |
| `startTime()` | `0x78e97925` | uint256 (Unix seconds) | When vesting starts. |
| `endTime()` | `0x3197cbb6` | uint256 (Unix seconds) | When fully vested. |
| `cliffLength()` | `0xe0131fd1` | uint256 (seconds) | Relative offset from start (0 = no cliff). |
| `beneficiary()` | `0x38af3eed` | address | Equals `recipient` in practice. |
| `recipient()` | `0x66d003ac` | address | Who can claim. |
| `token()` | `0xfc0c546a` | address | ERC20 token being vested (e.g. SWISE). |
| `paused()` | `0x5c975abb` | bool | If true, claiming is disabled. |

Worked example: `0x03977b32b4da5146d1c7f357402bd397adfb3efb` (a Mainnet escrow):

```
unclaimedAmount() → 0  (fully claimed already)
totalAmount() → 10838945 SWISE
startTime() → 0x61564f80 = 1633046400 (Oct 1, 2021 00:00 UTC)
endTime() → 0x6082cc55 = 1619184725 (Apr 23, 2021 13:32 UTC)  ← end before start — this escrow was unwound; answer the user "this escrow appears to have been unwound; unclaimedAmount is 0, nothing to claim"
paused() → 1 (true)
```

Recommended single-call answer flow: read `totalAmount`, `unclaimedAmount`, `claimedAmount`, `endTime`, `startTime`, `cliffLength`, `paused`, `recipient` in one batch (6–8 RPC calls).

### LeverageStrategy V2 — boost strategy proxy

For boost positions, `LeverageStrategyPosition.proxy` from the subgraph gives the strategy proxy address directly. If you need to compute it for a (vault, user) pair not yet in the subgraph:

| Function | Selector | Args | Returns |
|---|---|---|---|
| `getStrategyProxy(address vault, address user)` | `0xa6ed20f0` | vault, user | address of strategy proxy |

### osToken (osETH/osGNO) ERC20

Standard ERC20:

| Function | Selector | Args | Returns |
|---|---|---|---|
| `balanceOf(address)` | `0x70a08231` | user | uint256 wei |
| `totalSupply()` | `0x18160ddd` | — | uint256 wei |
| `decimals()` | `0x313ce567` | — | uint8 (18) |

### Keeper — live-state checks

Subgraph mirrors `Vault.canHarvest` and `Vault.isCollateralized`, so use the Keeper directly only when subgraph indexing lag matters (1–5 seconds after a harvest tx).

| Function | Selector | Args | Returns |
|---|---|---|---|
| `canHarvest(address vault)` | `0xfb70261a` | vault | bool |
| `isCollateralized(address vault)` | `0x02ad4d2a` | vault | bool |

Keeper contract address per network: `@stakewise/v3-sdk/src/helpers/configs/<network>.ts` field `contracts.base.keeper`.

### Chainlink price oracles (ETH/USD, etc.)

For fiat conversion you can also call a Chainlink aggregator's `latestAnswer()`. But the subgraph already exposes `ExchangeRate.assetsUsdRate` — prefer subgraph unless you need millisecond-fresh data.

| Function | Selector | Returns |
|---|---|---|
| `latestAnswer()` | `0x50d25bcd` | int256 (price × 10^8 for ETH/USD) |

## When NOT to use RPC fallback

Most StakeWise read questions are answered by the subgraph — APY, balances, exit queue, history, sub-vaults, distributor claims. Use RPC only for:

- Live osToken share↔asset conversion (subgraph doesn't expose the current `convertToAssets` factor)
- Live osToken `feePercent` / `avgRewardPerSecond` (subgraph stores last-snapshotted, not live)
- Vesting unlock schedule (subgraph stores only escrow identity, not amounts/timestamps)
- Strategy proxy address for a user who hasn't yet deposited into boost
- Tx that just landed and hasn't been indexed (1–5 second lag)

For everything else, **subgraph first**.

## Privacy note

A public RPC sees the IP + the call's calldata. For `convertToAssets(1e18)` that's no PII — it's a pure-function read. For vesting reads the contract address could indirectly identify a user; if that matters, suggest the user run a personal RPC node and substitute the URL.
