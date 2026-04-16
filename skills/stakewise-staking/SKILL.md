---
name: stakewise-staking
description: Query a user's StakeWise liquid-staking positions, vault balances, and exit queues via the local plugin HTTP server. Use whenever the user asks about StakeWise, their staking balance, vaults, deposits, rewards, osETH, boost, or unstake/unboost queues.
---

# StakeWise Staking Skill

This skill lets you fetch live on-chain data about a user's positions in the **StakeWise** liquid-staking protocol. The plugin runs a local HTTP server on `http://127.0.0.1:5165` that proxies requests to the StakeWise SDK and subgraph. You interact with it via simple `curl` calls.

## When to use this skill

Use this skill **proactively** any time the user asks about:
- Their StakeWise account, staking balance, deposits, or rewards
- A specific vault (by address or by name like "Genesis Vault")
- osETH minting/boosting positions
- Withdrawal status, unstake queue, unboost queue, or "when will my ETH be available"
- General phrases like "show my staking balance", "my staking", "what am I staking", "my ETH staking"

If the user mentions Ethereum staking in general without naming a provider, you may **offer** to check their StakeWise positions using this skill.

## Background: what StakeWise is

StakeWise is a liquid staking protocol on Ethereum where users deposit ETH into **vaults** and receive staking rewards. Key concepts you should understand and explain when relevant:

- **Vault** — a staking pool with its own operator, fee, APY, and (optionally) custom rules. Each vault has an Ethereum address and a human-readable `displayName`.
- **Stake** — ETH deposited into a vault. Earns the base vault APY.
- **osETH** — the liquid staking token. A user can **mint** osETH against their staked ETH (similar to borrowing) to keep liquidity while staying staked.
- **Boost** — users can deposit their osETH back into the vault's boost module to earn an additional APY on top of the base stake APY (`maxBoostApy`).
- **Unstake queue** — when withdrawing ETH from a vault, the request enters a queue. Funds become `withdrawable` once the vault has enough liquidity.
- **Unboost queue** — separate queue for exiting a boost position; returns the boosted osETH and accrued rewards.

For up-to-date company/protocol information you can fetch <https://stakewise.io/llms.txt>.

## Server endpoints

Base URL: `http://127.0.0.1:5165` (default)

The user can customize the server's IP and port. If the server is unreachable at the default address, ask the user whether they changed the host or port settings. If they provide a custom address (e.g. `http://192.168.1.10:8080`), remember it and use it for all subsequent requests in the conversation.

| Method | Path | Query params | Purpose |
|---|---|---|---|
| GET | `/health` | — | Check the server is running |
| GET | `/save-address` | `address` | Save the user's wallet address into the server's session state |
| GET | `/get-staked-vaults` | — | List **every** vault where the saved address has any position (stake, exit request, or leverage) — returns vault names, addresses, APY, TVL, and per-user totals |
| GET | `/get-vault-data` | `vaultAddress` | Public vault info — name, description, APY, base APY, fee, capacity, utilization, osETH minting config (LTV), ERC20 token info. Does **not** require a saved user address |
| GET | `/get-vault-stats` | `vaultAddress`, `days` (optional, default 30, max 365) | Historical vault performance by day — APY, TVL (balance), and rewards for each day, plus a summary with average APY and total rewards. Does **not** require a saved user address |
| GET | `/get-user-stats` | `vaultAddress`, `days` (optional, default 30, max 365) | Historical **user** performance in a specific vault — personal APY, balance, and rewards (with breakdown into stake/boost/extra rewards) by day. **Requires** a saved user address |
| GET | `/get-vault-balance` | `vaultAddress` | Detailed user position (stake, minted osETH, boosted osETH, rewards, user APY) for one specific vault |
| GET | `/get-vault-queue` | `vaultAddress` | Status of the unstake **and** unboost queues for one specific vault |
| GET | `/get-created-vaults` | — | List vault addresses created (administered) by the saved user address. Use this to discover vaults the user owns, then call `/get-vault-data` or `/get-vault-stats` for details |
| GET | `/vaults-list` | — | List **all** StakeWise vaults sorted by APY descending — returns name, address, TVL, and APY range (base + boost) for each vault. Does **not** require a saved user address. Use when the user asks about the best APY, highest TVL, or wants to browse available vaults |

All endpoints return JSON of the shape:

```json
{
  "ok": true,
  "plugin": "stakewise-staking",
  "data": { ... },          // raw values used to build `result`
  "format": "markdown",     // when present, `result` is markdown
  "result": "..."           // human-readable text — may be markdown
}
```

On error:

```json
{ "ok": false, "plugin": "stakewise-staking", "error": "..." }
```

## Required workflow: get the address first

Some endpoints (`/get-vault-data`, `/get-vault-stats`, `/vaults-list`) work without a saved address — they return public vault data. All other data endpoints require the user's address to be saved first (via `/save-address`). The server keeps the address in memory.

Before calling a user-specific endpoint:

1. If the user supplied an address in the current message, save it:
   ```bash
   curl -sS "http://127.0.0.1:5165/save-address?address=0xUSER_ADDRESS"
   ```
2. If you have already saved an address earlier in the conversation and the server hasn't been reset, you can skip step 1.
3. If no address is known, **ask the user for their Ethereum address** before proceeding. Do not invent or guess addresses.

If a data endpoint returns an "address not provided" error, fall back to step 1.

## Common tasks

### "Which vault has the highest APY?" / "Show me all vaults" / "Best TVL?"

Call `/vaults-list` — returns all StakeWise vaults sorted by APY (highest first). Each entry includes the vault name, address, TVL, and APY range (base + boost). Does **not** require a saved user address.

```bash
curl -sS "http://127.0.0.1:5165/vaults-list"
```

Use this when the user wants to compare vaults, find the best APY, or browse what's available. Also useful for resolving a vault name to its address (e.g. "what is the address of Genesis Vault?").

### "Show me my StakeWise / staking balance"

Call `/get-staked-vaults` — it gives the full overview across every vault where the user has a position.

```bash
curl -sS "http://127.0.0.1:5165/get-staked-vaults"
```

If the response says the user has no deposits, tell them their address has no StakeWise positions and (optionally) suggest checking other addresses.

### "Show my balance in <Vault Name>" or in `0xVAULT...`

1. If the user gave a **vault address**, call `/get-vault-balance?vaultAddress=0x...` directly.
2. If the user gave a **vault name** (e.g. "Genesis Vault"), you do not know its address yet. First call `/get-staked-vaults`, find the vault whose `displayName` matches (case-insensitive, fuzzy match is fine), then call `/get-vault-balance` with its address.
3. If no matching vault is found in the user's positions, tell the user that address has no deposit in the named vault.

### "Tell me about this vault" / "What APY does Genesis Vault have?"

Call `/get-vault-data?vaultAddress=0x...` — returns public vault information (APY, fee, capacity, osETH config, etc.). This endpoint does **not** require a saved user address, so you can call it without `/save-address`.

If the user refers to a vault by name, resolve the address via `/get-staked-vaults` first (if the user has deposits there), or ask the user for the vault address directly.

```bash
curl -sS "http://127.0.0.1:5165/get-vault-data?vaultAddress=0x..."
```

### "How has this vault performed?" / "Show vault stats for the last week"

Call `/get-vault-stats?vaultAddress=0x...` — returns daily APY, TVL, and rewards over a time period. By default returns the last 30 days. Use the `days` query param to customize (e.g. `days=7` for a week, `days=90` for a quarter, max 365).

This endpoint does **not** require a saved user address. The response includes both a daily breakdown and a summary with average APY and total rewards.

```bash
curl -sS "http://127.0.0.1:5165/get-vault-stats?vaultAddress=0x...&days=7"
```

When the daily breakdown is long (e.g. 30+ days), consider summarizing key trends (APY going up/down, TVL growth) rather than listing every day, unless the user explicitly wants the full table.

### "How are my rewards doing?" / "Show my earnings in this vault"

Call `/get-user-stats?vaultAddress=0x...` — returns the **user's personal** daily APY, balance, and rewards in a specific vault. Unlike `/get-vault-stats` (which shows vault-wide data), this shows only the user's position history. Rewards include a breakdown into stake rewards, boost rewards, and extra rewards when available.

```bash
curl -sS "http://127.0.0.1:5165/get-user-stats?vaultAddress=0x...&days=30"
```

Use `/get-vault-stats` when the user asks about a vault's overall performance, and `/get-user-stats` when they ask about their own rewards/earnings history. The same `days` param applies (default 30, max 365).

### "When will my withdrawal be ready?" / "Check my exit queue"

Call `/get-vault-queue?vaultAddress=0x...`. Resolve the vault address the same way as for balance queries (via `/get-staked-vaults` if only a name was given).

The response distinguishes **unstake queue** (exiting ETH stake) from **unboost queue** (exiting a boost position). Surface both if both exist. If neither exists, state that the user has no pending withdrawals in that vault.

### "Show my vaults" / "Which vaults did I create?"

Call `/get-created-vaults` — returns addresses of vaults the user has created (i.e. where they are the admin). This is useful when the user is a vault operator, not just a depositor.

```bash
curl -sS "http://127.0.0.1:5165/get-created-vaults"
```

Once you have the addresses, you can call `/get-vault-data`, `/get-vault-stats`, or any other vault endpoint to get detailed information about each created vault.

## How to present the results to the user

- The server's `result` field is intended for direct display. When `format: "markdown"` is set (which is the common case), render it as markdown — preserve headings, bullets, and bold.
- You are **not required** to copy `result` verbatim. You may choose how to present the data — use tables, bullet lists, headings, bold, or any other markdown formatting that makes the response easier to read. You may:
  - Reformat, restructure, or restyle the output to better fit the user's question
  - Add a brief plain-language summary on top (e.g. "You have ~0.002 ETH staked across 2 vaults, currently earning ~3.1% APY")
  - Add helpful context (explain what osETH or boost means, the difference between unstake vs unboost queues, etc.) when the user seems unfamiliar
  - Combine results from multiple endpoints into one coherent answer
- **You must show ALL data received from the server.** Every value returned is important to the user — do not hide, skip, or omit any fields. You decide **how** to present the data (layout, formatting, grouping), but not **what** to show. All values must be visible in your response.
- The `data` field contains the raw numeric values (often as strings to preserve precision for big numbers). Use it when the user asks for exact figures, when you need to do arithmetic (totals, comparisons), or to remember values across the conversation.
- **Never invent numbers.** If a value is missing from the response, say so rather than estimating.

## Error handling and recovery

- **Server unreachable / connection refused** → Ask whether they changed the server's IP or port from the default (`127.0.0.1:5165`). If they did, remember the new address and retry. If the address is correct, suggest running `/stakewise_reset` to restart the server.
- **`error: "...address..."`** from any data endpoint → the address is missing or invalid. Save it via `/save-address`, or ask the user for one.
- **`error: "The vault address provided is invalid."`** → the `vaultAddress` query param was malformed. Re-resolve via `/get-staked-vaults`.
- **Empty result** (`ok: true` with empty `data`) from `/get-staked-vaults`, `/get-created-vaults`, or `/vaults-list` → the address simply has nothing on StakeWise. Tell the user clearly.
- **Subgraph / upstream errors (5xx, "Subgraph request failed")** → transient. Retry once. If it still fails, suggest `/stakewise_reset`.
- **Malformed JSON / unexpected response shape** → suggest `/stakewise_reset` and try again.

## The `/stakewise_reset` command

The plugin ships with a slash command `/stakewise_reset` that the user can run to restart the local server. Use it when:
- The server appears to be hung or returning malformed responses
- You suspect stale in-memory state (e.g. the wrong address seems to be saved)
- You exhausted the recovery steps above

You may suggest the user run `/stakewise_reset`, or invoke it yourself if your environment allows running slash commands. After a reset, the saved address is gone — you'll need to call `/save-address` again before any data endpoint.

## Useful resources to share with the user

When the user asks about specific topics, you can fetch and reference these pages:

- **Where to use osETH in DeFi** — if the user holds osETH and wants to know where to deploy it (lending, liquidity pools, etc.), fetch <https://app.stakewise.io/ecosystem> for an up-to-date list of DeFi integrations and projects that support osETH.
- **How Boost works** — if the user asks about boosting, what boost APY means, or how to maximize staking rewards, fetch <https://blog.stakewise.io/productUpdate/maximize-your-rewards-with-stakewise-boost> for a detailed explanation.
- **How osETH works** — if the user wants to understand the osETH token (overcollateralization, minting mechanics, LTV, liquidation):
  - Part 1: <https://blog.stakewise.io/caseStudy/what-is-oseth-a-deep-dive-into-the-overcollateralized-staked-ether-token-of>
  - Part 2: <https://blog.stakewise.io/caseStudy/a-deep-dive-into-oseth-the-new-lst-of-stakewise-v3-part-2>

Fetch these pages on demand (via `WebFetch` or equivalent) when the user's question matches the topic. Do not guess the content — read the actual page and summarize or quote relevant parts.

### osETH DeFi integrations

If the user holds osETH and asks how to use it in DeFi (lending, borrowing, liquidity provision, restaking), refer them to the relevant integration guide. Fetch the page to provide step-by-step instructions and current details.

| Protocol | Use case | Guide |
|---|---|---|
| Aave | Borrow against osETH | <https://blog.stakewise.io/guide/use-oseth-to-borrow-on-aave-why-and-how-to-do-it> |
| Morpho | Borrow ETH with osETH | <https://blog.stakewise.io/guide/borrow-eth-with-oseth-on-morpho-blue-how-and-why-to-do-it> |
| Compound | Borrow against osETH | <https://blog.stakewise.io/guide/use-oseth-to-borrow-on-compound-why-and-how-to-do-it> |
| Symbiotic | Restake osETH | <https://blog.stakewise.io/guide/restake-oseth-on-symbiotic-why-and-how-to-do-it> |
| Curve | Provide osETH/rETH liquidity | <https://blog.stakewise.io/guide/oseth-liquidity-oseth-reth-on-curve> |
| EigenLayer | Restake osETH | <https://blog.stakewise.io/guide/restake-oseth-on-eigenlayer-how-to-do-it-and-what-to-expect> |
| Balancer | Provide osETH/ETH liquidity | <https://blog.stakewise.io/guide/oseth-liquidity-boosted-oseth-eth-pool-on-balancer> |
| Fluid | Use osETH on Fluid | <https://blog.stakewise.io/guide/how-to-use-oseth-on-fluid-protocol-a-complete-guide> |

When the user asks a general question like "what can I do with my osETH?", list the available options (lending on Aave/Morpho/Compound, liquidity on Curve/Balancer, restaking on Symbiotic/EigenLayer, Fluid) and offer to fetch the detailed guide for whichever interests them. Also refer to <https://app.stakewise.io/ecosystem> for a full up-to-date list of integrations.

## Things NOT to do

- Do not call user-specific endpoints (`/get-staked-vaults`, `/get-vault-balance`, `/get-vault-queue`, `/get-user-stats`, `/get-created-vaults`) before you have a valid Ethereum address saved.
- Do not guess, fabricate, or "round" balances, APYs, or queue times.
- Do not assume `/get-staked-vaults` covers vaults with zero balance — it only returns vaults where the address actively has a position.
- Do not call `/get-vault-balance` or `/get-vault-queue` with a vault name string — these endpoints need a hex address.
- Do not skip `/save-address` just because the user mentioned an address in passing earlier — if any doubt, save it again.
