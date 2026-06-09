---
name: stakewise-data-query
description: Use when the user asks a natural-language question (in any language) about StakeWise V3 staking data — APY, vault TVL, their stake or earnings, exit-queue ETA, osETH/osGNO mint capacity or health factor, boost position, leverage borrow LTV, distributor (merkle) claims, vesting positions, transaction history, exchange rates, or sub-vaults. Read-only. Talks to the public StakeWise subgraphs and backend GraphQL on Mainnet and Gnosis via WebFetch / curl. No SDK install or local server required. Always answer in the user's language. Skip when @stakewise/v3-sdk is imported in the project — that's a developer use case handled by a sibling skill.
metadata:
  version: "0.2.0"
---

# StakeWise data-query skill

Answer questions about StakeWise V3 by hitting public read endpoints directly. No SDK, no local server, no auth.

**Flow.** User question → identify data domain → consult the matching entity reference → build GraphQL → WebFetch (parallel where possible) → parse → respond in user's language.

**Language.** Respond in the same language the user wrote in. Field names, GraphQL keywords, URLs, and `0x` addresses stay in their original form — only the prose around them is translated.

## Execution rules — apply unconditionally

1. **Trust this skill.** When a rule applies, follow it directly. Do not re-derive the answer by introspecting unrelated entities or scanning extra sections for confirmation.
2. **Consult each section at most once per turn.** Prior consults are authoritative; do not revisit mid-answer.
3. **Decide once.** Network, time range, filter — pick at the start of the turn and execute. Do not re-evaluate the same decision after a result.
4. **Batch independent fetches.** Cross-network aggregates and multi-entity composites fire in parallel, not sequentially.
5. **Don't poll in one turn.** Soft rate limit ~1 query/sec; typical question = 1–3 queries. If subgraph lag is suspected, surface it via `Checkpoint` once and let the user decide whether to retry.

## Decision tree

1. **Inputs needed before any query:**
   - **User's 0x address** for user-specific queries (balance, earnings, exit queue, osETH health, boost, claims, vesting, transaction history, whitelist check). If missing, ask the user in their language — never guess. Vault-only queries (APY, TVL, exchange rates, network stats) don't need an address.
   - **Vault address** only for single-vault questions. For "show my positions" drop the vault filter.
   - **Vault by name** ("Genesis Vault"): resolve via `vaults(where: { displayName_contains_nocase: "<name>" }, first: 5)`. None → suggest the other network or check spelling. Many → list candidates.
   - **Time range** for history: default 30 days, mention it. Cap 365 days; hard cap 1000 days on snapshot entities.
   - **Discovery filter** ("top vaults"): default `orderBy: totalAssets, orderDirection: desc, first: 10`. "Best APY" → `orderBy: apy`.
   - **Network**: default Mainnet. GNO / xDAI / Gnosis → Gnosis. **Cross-network fallback**: if the address returns empty on the default network, probe the other network before "no positions".

2. **Lowercase every `0x` address** before `where:`. Mixed-case silently returns empty.

3. **BigInt fields are strings** — `BigInt(...)` before arithmetic. Never JS `Number`.

4. **Cite from sections below** — never invent field names or thresholds.

5. **Filter operators**: numeric (`_gt`, `_gte`, `_lt`, `_lte`, `_in`), boolean (exact), string (`_contains_nocase`), references (`_: { ... }` for nested).

## Endpoints

| Plane | Mainnet | Gnosis |
|---|---|---|
| Subgraph (primary) | `graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod` | `graphs.stakewise.io/gnosis/subgraphs/name/stakewise/prod` |
| Subgraph (replica) | `graphs-replica.stakewise.io/mainnet/subgraphs/name/stakewise/prod` | `graphs-replica.stakewise.io/gnosis/subgraphs/name/stakewise/prod` |
| Backend GraphQL | `mainnet-api.stakewise.io/graphql` | `gnosis-api.stakewise.io/graphql` |

**Fallback (subgraph only):** primary first. On HTTP 5xx, network timeout, or malformed JSON, retry **once** against the replica for that network. A `200 OK` with `errors[]` is a query bug — fix the query, do NOT rotate. `data: { entity: null }` is a clean miss (answer accordingly). If both primary and replica fail, return an honest "subgraph is currently degraded" — do not synthesise.

**Backend GraphQL** for: vault blacklist / hidden / verified flags, paginated validators, OFAC sanctions list, average exit-queue ETA, scoring breakdown. Subgraph handles everything else. Available backend queries: `vaults`, `vaultValidators`, `ofacAddresses`, `exitStats`, `scoringDetails`. Backend has no replica.

**Boost / leverage is Mainnet only.** On Gnosis say so and skip the boost path.

### How to send a query

Every query example in this skill is GraphQL. Send one as the `query` field of a JSON POST to the relevant endpoint URL — this is the only transport, used for all examples below:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query": "<paste a graphql query here>"}' \
  https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod
```

Response shape: `{ "data": { ... } }`; errors arrive as `{ "errors": [ ... ] }` instead of `data`. Backend queries use the same POST against the backend URL — note the backend takes `id` / `blacklisted` / `first` as **direct** arguments on `vaults(...)`, not inside a subgraph-style `where`:

```graphql
{
  vaults(id: "0xVAULT") {
    id
    blacklisted
    hidden
    verified
    avgExitQueueLength
  }
}
```

**Singular vs plural — a silent trap.** `vaults(id: …)` (plural with a direct `id` arg) is **backend-only**. The subgraph's `vaults` has no `id` argument: passing one is **silently ignored** — you get the whole vault list back with no error, so reading the "first" result gives a wrong vault. A single-vault subgraph read MUST use `vault(id: …)` (singular) or `vaults(where: { id: … })`. Subgraph-only Vault fields such as `allocatorMaxBoostApy`, `apy`, `score` therefore come via `vault(id: …)` — never `vaults(id: …)`.

### Source of truth for URLs

If anything above looks stale, the canonical endpoint list is the StakeWise SDK docs at `https://docs.stakewise.io/sdk/endpoints` (source: `@stakewise/v3-sdk` `documentation/endpoints.md`). Note both the primary host (`graphs.stakewise.io`) and the replica fallback host (`graphs-replica.stakewise.io`) serve the **`/prod`** deployment; the `/stage` path on either host is a separate non-production deployment — never use it for user answers.

## Quick lookups — act on these without consulting an entity reference

The patterns below cover the typical user question. Execute directly; consult the relevant entity reference only if the question deviates (extra filter, extra field, multi-vault aggregate, time range).

### Quick lookup 1 — "What's my stake in vault X?"

```graphql
{
  allocators(
    where: {
      address: "0xUSER",
      vault: "0xVAULT"
    }
  ) {
    assets
    apy
    totalEarnedAssets
    ltvStatus
    mintedOsTokenShares
    vault {
      displayName
    }
  }
}
```

Then:
- `assets / 1e18` → ETH staked.
- `apy` is **already** percent: `parseFloat(apy).toFixed(2) + '%'`. Do NOT multiply by 100.
- `totalEarnedAssets / 1e18` → lifetime earnings (can be negative — surface as-is).
- `ltvStatus` → quote directly.
- USD: multiply ETH amounts by `assetsUsdRate` from `exchangeRates(first: 1)`.

### Quick lookup 2 — "When can I withdraw?"

```graphql
{
  exitRequests(
    where: {
      owner: "0xUSER",
      isClaimed: false
    }
  ) {
    isClaimable
    withdrawalTimestamp
    totalAssets
  }
}
```

Two branches:
- `isClaimable == true` → "ready to withdraw N ETH now".
- Otherwise → "estimated ready at `new Date(withdrawalTimestamp * 1000)`" if set; otherwise fetch backend `exitStats { duration }` and surface network-wide average ("network average is ~D days").

Field shapes in the [Position entities](references/position-entities.md).

### Quick lookup 3 — "Is my osETH position healthy?"

Prefer the precomputed `Allocator.ltvStatus` enum (`Healthy / Moderate / Risky / Unhealthy`) — quote it directly. Only when the user explicitly wants a numeric health factor, compute it with the HF formula and status mapping in [Units and gotchas](references/units-and-gotchas.md) (LtvStatus). For boost users, surface both LTVs — see [Boost entities](references/boost-entities.md).

### Quick lookup 4 — "Am I allowed to stake in this private vault?"

Private vaults gate deposits via a whitelist; some vaults also maintain a blocklist of denied addresses. Fire one combined query:

```graphql
{
  vault(id: "0xVAULT") {
    isPrivate
    isBlocklist
    whitelister
    blocklistManager
  }
  privateVaultAccounts(
    where: {
      vault: "0xVAULT",
      address: "0xUSER"
    }
  ) {
    id
  }
  vaultBlockedAccounts(
    where: {
      vault: "0xVAULT",
      address: "0xUSER"
    }
  ) {
    id
  }
}
```

Canonical query names: `privateVaultAccounts` (whitelist for `isPrivate` vaults) and `vaultBlockedAccounts` (blocklist). The natural words "whitelistAccounts" / "blocklistAccounts" do NOT exist on prod and would 200-with-`errors[]`.

Decision:
- `isPrivate == false && isBlocklist == false` → public, anyone can stake.
- `isPrivate == true` → "yes" only if `privateVaultAccounts` is non-empty. Empty → "no, not on whitelist"; surface `whitelister` so the user knows who to ask.
- `isBlocklist == true` → "no" if `vaultBlockedAccounts` is non-empty; otherwise "yes". Surface `blocklistManager` in the "no" branch.

Field shapes in the [Network and misc entities](references/network-and-misc-entities.md).

### Quick lookup 5 — "My total stake across networks"

Run this same query against **both** the Mainnet and Gnosis subgraph URLs in parallel (separate WebFetch calls — never sequential):

```graphql
{
  allocators(where: { address: "0xUSER" }) {
    assets
    totalEarnedAssets
    vault {
      id
      displayName
    }
  }
}
```

Sum `assets / 1e18` per network → `{ mainnet: N ETH, gnosis: M GNO }`. ETH and GNO are different assets — do NOT add them. For USD totals, multiply each by its network's `assetsUsdRate` (Gnosis has none on its own subgraph — see [Units and gotchas → Gnosis quirks](references/units-and-gotchas.md) for the Mainnet-fallback rule).

### Quick lookup 6 — "What vaults do I have a position in?"

One query finds every vault where an address has a stake, a pending exit, or a boost position — no need to scan the whole vault list. Run against both the Mainnet and Gnosis subgraphs in parallel.

```graphql
{
  vaults(
    where: {
      or: [
        { allocators_: { address: "0xUSER" } },
        { exitRequests_: { owner: "0xUSER" } },
        { leveragePositions_: { user: "0xUSER" } }
      ]
    }
  ) {
    id
    displayName
  }
}
```

Branches: `allocators_` = active stake · `exitRequests_` = in the exit queue · `leveragePositions_` = boost position. A vault appears once if any branch matches; drop branches to narrow (keep only `allocators_` for "where am I staking now?"). Then pull per-vault details with the matching Quick lookup above.

## Don't hallucinate

- Quote endpoint URLs and field names verbatim from the entity sections below.
- Unknown field → verify on prod via per-type introspection (see [Units and gotchas → Verify unknown fields](references/units-and-gotchas.md)). Missing on prod → say so honestly.
- Numeric thresholds (LTV status cutoffs, dust cut-off, 1000-day cap) come from **Units and gotchas** — copy, don't invent.
- Blog article URLs come from the [Blog articles](references/blog-articles.md). Do NOT paraphrase article content from training data; do not invent URLs.

## When something fails — troubleshoot in this order

1. **Empty array on user lookup** → address case. Lowercased before `where: { address }`?
2. **Empty array on vault-specific user lookup** → wrong network. Probe the other network.
3. **HTTP 5xx / timeout / malformed JSON** → primary outage. Retry once on replica (subgraph only). Second failure → surface outage.
4. **HTTP 200 + `errors[]`** → query bug. NOT a network issue, do NOT rotate. Verify field via introspection (see [Units and gotchas → Verify unknown fields](references/units-and-gotchas.md)), then retry.
5. **Number "looks wrong"** → unit confusion. Check the numeric units table in [Units and gotchas](references/units-and-gotchas.md) (`feePercent` basis points i.e. ÷100 for percent, `OsTokenConfig.*Percent` ×1e16, `Aave.*Percent` ×1e18, `apy` already %, snapshot timestamps in microseconds). Or wei→ETH (÷1e18). Negative `totalEarnedAssets` is real — surface as-is.
6. **Vault missing from marketplace answer** → forgot to exclude backend blacklist (see [Units and gotchas → Backend blacklist](references/units-and-gotchas.md)).
7. **Subgraph behind real-time** → indexing lag. Query the `Checkpoint` entity ([Network and misc entities](references/network-and-misc-entities.md)) and compare its `timestamp` with now; surface the lag and suggest a retry if stale.

If none apply → introspect the entity to verify the field still exists on prod (schemas evolve).

## Out of scope

- Writes / transactions (deposit, withdraw, mint, boost). Defer to `app.stakewise.io` or `@stakewise/v3-sdk`.
- On-chain `eth_call` reads (vesting claimable amount, `convertToAssets` rate, contract liveness). Defer to `app.stakewise.io`.
- V2 (`sETH2` / `rETH2`) deep details — V2 is legacy. The skill only detects a leftover V2 balance (`V2Pool` / `V2PoolUser`) and points the user to `app.stakewise.io` to migrate — it does not perform or explain the migration.
- Swap aggregator quotes, bridge transfers, Balancer-recovery UI flow — not subgraph data.
