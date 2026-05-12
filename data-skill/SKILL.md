---
name: stakewise-data-query
description: Use when the user asks a natural-language question (in any language) about StakeWise V3 staking data — APY, vault TVL, their stake or earnings, exit-queue ETA, osETH/osGNO mint capacity or health factor, boost position, leverage borrow LTV, distributor (merkle) claims, vesting unlocks, transaction history, exchange rates, or sub-vaults. Read-only. Talks to the public StakeWise subgraphs and backend GraphQL on Mainnet, Gnosis, and Hoodi via WebFetch / curl; uses public RPC nodes for on-chain conversions when needed. No SDK install or local server required. Always answer in the user's language. Skip when @stakewise/v3-sdk is imported in the project — that's a developer use case handled by a sibling skill.
version: 0.1.0
---

# StakeWise data-query skill

Answer questions about StakeWise V3 by hitting public read endpoints directly. No SDK, no local server, no auth.

**Language**: respond in the same language the user wrote in. Field names, contract addresses, GraphQL keywords, URLs stay in their canonical form (English / hex) — only the prose answer is translated. Worked examples below are written in English for compactness; translate the surrounding prose on the fly.

## What this is for / not for

**For**: vault APY and config; user stake, earnings, exit queue, osETH health, boost position; APY/earnings history; merkle airdrops; vestings; transaction history; sub-vault composition; live exchange rates.

**Not for**: sending transactions (deposit, withdraw, mint, boost) — defer to `app.stakewise.io` or the SDK. V2 sETH2 details beyond migration leftover. Swap quotes / bridge / balancer-recovery (those are UI-only flows, not subgraph data).

**Where the skill is STRICTLY better than `app.stakewise.io`:**

- **Blacklisted vaults** — `app.stakewise.io/vault/<network>/<addr>` redirects back to `/vaults` for any vault that the backend flags as `blacklisted: true`. The marketplace card may still show a truncated address with `Deposit: 0.00` even when the user has an active exit queue position. **Users can't see their exit queue ETA via UI for blacklisted vaults.** The skill answers correctly using `exitRequests(where: { owner })` on the subgraph regardless — but should warn the user that the UI hides the vault for a backend reason (likely safety / compliance). To verify, query the backend: `vaults(id) { blacklisted hidden verified }` on `{net}-api.stakewise.io/graphql`.
- **`Allocator.exitingAssets > 0` summary** — UI shows it on a per-vault detail page only, which is unreachable for blacklisted vaults. The skill can sum `exitingAssets` across all vaults for a user in a single query.
- **Negative `totalEarnedAssets`** (slashing/penalty cases) — UI may hide or show as 0; the skill surfaces the actual signed value.
- **Cross-network position aggregate** — UI scopes to the currently-selected network. The skill can fire 3 parallel queries and sum across Mainnet + Gnosis + Hoodi.

When the user complains "the app doesn't show my exit", that's the cue to query the subgraph directly + check backend `vaults(id).blacklisted` and explain the discrepancy honestly.

## Decision tree — apply for every question

1. **Inputs you need before any query**:
   - **User's 0x address** for anything user-specific (balance, earnings, exit queue, osETH health, boost, distributor claims, vestings, transaction history, whitelist check, created vaults). If you don't have it, **ask the user** in their language. Never guess, never use a placeholder, never silently proceed without it. Vault-only questions (APY, TVL, vault list, exchange rates, network stats) do not need an address.
   - **Vault address** only when the question targets a single vault (e.g. "my stake in vault 0x..." or "what's the APY of vault X"). For "show my balance / earnings / positions" without a named vault, **drop the vault filter** and let the subgraph return all the user's positions across vaults — do NOT ask "which vault".
   - **Vault referenced by name**: if the user says "Genesis Vault" / "Chorus One vault" / similar, resolve to an address by querying `vaults(where: { displayName_contains_nocase: "<name>" }, first: 5) { id displayName }`. If exactly one match — proceed. If zero — tell the user, suggest checking another network or the spelling. If multiple — list the candidates with addresses and ask which one.
   - **Time range** for history questions ("show my rewards over time"): if the user didn't specify a period, default to the last 30 days and mention it in the response. Cap at 365 days unless asked otherwise; hard cap 1000 days (per `AllocatorSnapshot` client convention).
   - **Filter criteria** for vault-discovery questions ("show me the best vaults", "top vaults"): if the user didn't specify, default to `orderBy: totalAssets, orderDirection: desc, first: 10` (top by TVL) and mention the default. If they say "best APY" without other constraints, switch to `orderBy: apy`.
   - **Network**: default Mainnet. If the user mentions GNO / xDAI / Gnosis → Gnosis. If they mention testnet / Hoodi → Hoodi. When defaulting to Mainnet, mention it in your reply. **Cross-network fallback** for user-specific queries: if the user's address returns an empty result on the default network, automatically probe the other two networks (parallel queries) before telling them "no positions found"; if you find positions on another chain, surface it.
2. **Data plane**:
   - Vault state, Allocator, ExitRequest, snapshots, distributor claims, vestings, sub-vaults, exchange rates → **subgraph** (`graphs.stakewise.io`).
   - Validators of a vault, paginated → **backend GraphQL** (`{net}-api.stakewise.io/graphql`).
   - osToken share↔asset conversion, vesting unlock schedule, live rate from `mintTokenController` → **public RPC eth_call** (see `rpc-fallback.md`; degrades gracefully via two-tier fallback).
   - Boost / leverage is Mainnet + Hoodi only; on Gnosis say so and skip the boost-specific recipe.
3. **Lowercase every `0x` address** before putting it in a `where:` clause. Mixed-case returns empty results with no error.
4. **BigInt fields come back as strings** — parse with `BigInt(...)` before arithmetic. Never coerce wei amounts to JS `Number`.
5. **Cite derived values from references** — never invent field names or thresholds.

## Endpoints — quick reference

| Plane | Mainnet | Gnosis | Hoodi |
|---|---|---|---|
| Subgraph (primary) | `graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod` | `graphs.stakewise.io/gnosis/.../prod` | `graphs.stakewise.io/hoodi/.../prod` |
| Subgraph (replica) | `graphs-replica.stakewise.io/mainnet/.../stage` | `graphs-replica.stakewise.io/gnosis/.../stage` | `graphs-replica.stakewise.io/hoodi/.../prod` |
| Backend GraphQL | `mainnet-api.stakewise.io/graphql` | `gnosis-api.stakewise.io/graphql` | `hoodi-api.stakewise.io/graphql` |
| Public RPC | `ethereum-rpc.publicnode.com` (rotation list in `rpc-fallback.md`) | `rpc.gnosischain.com` | `rpc.hoodi.ethpandaops.io` |

**Subgraph rotation**: on HTTP 5xx / network timeout / malformed-JSON body against the primary, retry once against the replica URL for that chain (Mainnet/Gnosis use `…/stage` on the replica host; Hoodi uses `…/prod`). Replica is ~1 block behind primary, schema-compatible, different deployment hash. A `200 OK` with `errors[]` is a query problem, not an infra problem — do not rotate. Full rule in `references/endpoints.md`.

Full URLs, staging endpoints, and the source-of-truth note: `references/endpoints.md`.

## Worked example 1 — "What's my stake in vault X?"

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ allocators(where:{address:\"0xuser\",vault:\"0xvault\"}){ assets apy totalEarnedAssets ltvStatus mintedOsTokenShares vault{ displayName } } }"}' \
  https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod
```

Then: `assets / 1e18` → human ETH; `parseFloat(apy).toFixed(2) + '%'` → percent (apy is **already** percent — do NOT multiply by 100); `totalEarnedAssets / 1e18` → lifetime earnings; quote `ltvStatus` directly. Multiply by `assetsUsdRate` from `exchangeRates(first:1)` for USD context.

## Worked example 2 — "When can I withdraw?"

Query `exitRequests(where: { owner: "0xuser", isClaimed: false })` for `isClaimable`, `withdrawalTimestamp`, `totalAssets`. Two branches:
- `isClaimable == true` → "ready to withdraw N ETH now".
- Else → "estimated ready at `new Date(withdrawalTimestamp * 1000)`" if set; otherwise "ETA depends on validator exit queue; typically a few days".

Full body in `references/cookbook.md` recipe 3.

## Worked example 3 — "Is my osETH position healthy?"

Prefer the **precomputed** `Allocator.ltvStatus` enum (`Healthy / Moderate / Risky / Unhealthy`) — quote it directly. Only compute the numeric health factor when the user wants a number:

```
HF = (assets × liqThresholdPercent / 1e18) / mintedAssetsValue
```

Mapping: `HF ≥ 1.02` Healthy; `≥ 1.01` Moderate; `≥ 1.00` Risky; `< 1.00` Unhealthy. Liquidation threshold `liqThresholdPercent` is wei-style percent (e.g. `9.2 × 10^17` = 92%) — divide by 1e16 for percent.

## Worked example 4 — On-chain conversion via public RPC

When the user asks "how much ETH is 100 osETH right now" (no `convertToAssets` field in the subgraph):

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x2A261e60FB14586B474C208b1B7AC6D0f5000306","data":"0x07a2d13a0000000000000000000000000000000000000000000000056bc75e2d63100000"},"latest"],"id":1}' \
  https://ethereum-rpc.publicnode.com
```

On 429 / 5xx / timeout → fall back to `eth.llamarpc.com`, then `rpc.ankr.com/eth`. If all three fail → fetch `https://chainid.network/chains/eip155-1.json`, parse `chain.rpc[]`, filter `${...}` templates, probe one with `eth_chainId`. Procedure detailed in `references/rpc-fallback.md`.

## Which reference to read when

| User question shape | First read |
|---|---|
| "What is StakeWise / what's an entity / what fields does X have?" | `references/entities.md` |
| "Give me a query for Y" | `references/cookbook.md` (19 recipes + 19 follow-up hints `A–S`) |
| "Why is my number wrong / off by 10^18 / why empty?" | `references/units-and-gotchas.md` |
| "I need on-chain data the subgraph doesn't have" | `references/rpc-fallback.md` |
| "Does field X actually exist?" | `references/schema-snapshot.graphql` (canonical) |
| "Which URL / which network?" | `references/endpoints.md` |

## Indexing lag — for "I just deposited and don't see it"

Subgraph is eventually consistent (1–5 second lag after a tx). To verify, query the `Checkpoint` entity:

```graphql
{ checkpoints(first: 1, orderBy: timestamp, orderDirection: desc) { timestamp } }
```

If `now - timestamp > 30s`, surface to the user that the subgraph is lagging. Otherwise suggest a 10-second retry.

## When you need the backend (not subgraph)

Only two read use cases live in the backend GraphQL instead of the subgraph:

- **Paginated validators per vault** — `vaultValidators(vaultAddress, skip, first)` returning `publicKey`, `apy` (alias for `apr`), `income`, `createdAt`. See cookbook follow-up C.
- **Boost-dashboard time-series chart** — `/api/boostDashboard?from=ISO&to=ISO` REST endpoint, Mainnet only, deferred to v0.2.

Everything else: subgraph first.

## Privacy and rate limits

The public subgraph has no auth. The user's `0x` address goes into a `where:` filter — that's on-chain data, not PII, but state this explicitly if asked. The hosted subgraph has soft rate limits (~1 query/sec sustained is safe). For one user question you'll fire 1–3 queries — fine. **Never poll inside one conversation turn.**

## Don't hallucinate

- Quote endpoint URLs and entity field names from `endpoints.md` and `entities.md` verbatim.
- If the user asks for a field that isn't in `entities.md`, open `schema-snapshot.graphql` and confirm it exists before answering.
- Numeric thresholds (LTV status cutoffs, borrow status thresholds, 1000-day snapshot cap) come from `units-and-gotchas.md` — copy them, don't invent.

## When the question isn't in the cookbook

The cookbook has 19 worked recipes (`1–19`) + 19 follow-up hints (`A–S`). If the user's question doesn't match any of them:

1. Find the right entity in `entities.md` (organised by use case: vault state / position / history / rates / boost / distributor / meta vaults / vesting / whitelist / network stats / sync / validators / V2).
2. Build the query from the **listed** fields of that entity. Filter operators available on numeric fields: `_gt`, `_gte`, `_lt`, `_lte`, `_in`. On boolean: exact match. On string: `_contains_nocase`. On reference: `_: { ... }` for nested filtering.
3. If the data the user wants is not represented by any field across `entities.md` and `schema-snapshot.graphql`, say so honestly: "the StakeWise subgraph doesn't track this — you'd need [SDK / on-chain call / off-chain analytics]." Don't fabricate a field name to make the user happy.

Examples of questions that **can** be answered by composing existing recipes:
- "When was vault X created?" → recipe 13, read `createdAt`.
- "When did this vault last change its fee?" → recipe 13, read `lastFeePercent` + `lastFeeUpdateTimestamp`.
- "Which vaults has operator 0x... created?" → recipe 17.
- "Find all Genesis-named vaults" → recipe 15 with `displayName_contains_nocase: "Genesis"`.

Examples of questions the subgraph **cannot** answer (defer or say so):
- Real-time gas price → not StakeWise data, point to RPC `eth_gasPrice`.
- "How much will my withdrawal yield in USD at the moment I claim?" → ETH price moves; the subgraph stores the current `assetsUsdRate` only, future price unknown.
- "Who's the biggest osETH holder?" → there's no aggregated `topOsTokenHolders` view; you'd page through `OsTokenHolder` ordered by `balance` desc, but that's a heavy query — explain the cost or do it once with `first: 10`.

## Out of scope

- Writes / transactions of any kind. If the user wants to deposit, withdraw, mint, burn, or boost — point them to `app.stakewise.io` or the `@stakewise/v3-sdk` package.
- V2 sETH2 / rETH2 deep details — V2 is legacy; the subgraph keeps `V2Pool` / `V2PoolUser` entities for migration only.
- Swap aggregator quotes, bridge transfers, Balancer-recovery UI flow — these are not subgraph data.
- The boost-dashboard chart (`/api/boostDashboard`) in v0 — coming in v0.2. **Note:** `app.stakewise.io/boost-dashboard` is NOT a user-specific page — it's a static comparison of two demo wallets (one boosted, one not). When the user asks "show me boost performance" they probably mean their own position (recipe 5), not the dashboard.
