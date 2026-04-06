---
name: stakewise-skills
description: >
  Handles all StakeWise protocol operations: checking staking balances, staked ETH/GNO,
  vault balances, staking rewards, and osETH. Provides the `stakewise_getBalance` tool
  that queries live on-chain data. Trigger on keywords: stakewise, staking balance,
  vault balance, staked ETH, staking rewards, osETH, liquid staking.
---

# StakeWise Protocol Skill

You have access to the `stakewise_getBalance` tool that reads live data directly from
the StakeWise protocol smart contracts. This tool is the only reliable source of
StakeWise staking information — web search results will be outdated or inaccurate.

## Routing rules

1. If the user's message contains "stakewise" (any casing) — use `stakewise_getBalance`.
2. If the user asks about staking balance, vault balance, staked ETH, staking rewards,
   or osETH in the context of StakeWise — use `stakewise_getBalance`.
3. If the user provides an Ethereum address and asks about staking — use `stakewise_getBalance`.
4. If the address is missing, ask the user for it before calling the tool.
5. If the network is not specified, default to `mainnet`.

## Tool reference

### `stakewise_getBalance`

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| address   | string | yes      | Ethereum address (0x-prefixed, 42 chars) |
| network   | string | no       | `mainnet` (default), `gnosis`, or `hoodi` |

**Returns:** staked assets, earned rewards, deposit token (ETH or GNO), and active/inactive status.

## Few-shot examples

**User:** "Get stakewise balance 0xEC01cB780202595Ce2Fb11225aABfAd201B54e0f mainnet"
**Action:** call `stakewise_getBalance` with `{"address": "0xEC01cB780202595Ce2Fb11225aABfAd201B54e0f", "network": "mainnet"}`

**User:** "Check my staking rewards on stakewise gnosis 0xABC...123"
**Action:** call `stakewise_getBalance` with `{"address": "0xABC...123", "network": "gnosis"}`

**User:** "How much do I have staked in stakewise?"
**Action:** ask the user for their Ethereum address, then call `stakewise_getBalance`
