---
title: StakeWise V3 — Public Endpoints
description: Subgraph, backend GraphQL, and public RPC URLs for Mainnet, Gnosis, and Hoodi. Source of truth for the data-query skill.
---

# Public endpoints

All endpoints below are public, require no authentication, and are read-only. CORS is open for browser fetches.

## Subgraph (primary data plane)

Use the **production** endpoint by default. Staging mirrors the production schema but tracks an unstable deployment — only use it when reproducing a known issue.

### Production

| Network | Chain ID | URL |
|---|---|---|
| Mainnet | 1 | `https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod` |
| Gnosis | 100 | `https://graphs.stakewise.io/gnosis/subgraphs/name/stakewise/prod` |
| Hoodi (testnet) | 560048 (`0x88bb0`) | `https://graphs.stakewise.io/hoodi/subgraphs/name/stakewise/prod` |

### Replica fallback

Each network has a hot replica at host `graphs-replica.stakewise.io` that serves the same data as primary with a ~1 block lag. The path on the replica differs by network (Mainnet/Gnosis use `…/stage`, Hoodi uses `…/prod`) — this is an infra quirk; the data is functionally identical to primary. Probed 2026-05-12:

| Network | Primary (use first) | Replica fallback |
|---|---|---|
| Mainnet | `https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod` | `https://graphs-replica.stakewise.io/mainnet/subgraphs/name/stakewise/stage` |
| Gnosis | `https://graphs.stakewise.io/gnosis/subgraphs/name/stakewise/prod` | `https://graphs-replica.stakewise.io/gnosis/subgraphs/name/stakewise/stage` |
| Hoodi | `https://graphs.stakewise.io/hoodi/subgraphs/name/stakewise/prod` | `https://graphs-replica.stakewise.io/hoodi/subgraphs/name/stakewise/prod` |

Quick sanity probe — both URLs should return the same `displayName/apy/totalAssets` for the same vault id, with `_meta.block.number` ≤ 2 blocks apart:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ _meta { block { number } } vaults(first:1,orderBy:totalAssets,orderDirection:desc){ id apy totalAssets } }"}' \
  https://graphs-replica.stakewise.io/mainnet/subgraphs/name/stakewise/stage
```

Rotation rule (port of `gql-module/graphqlFetch.ts`):

1. Try **primary**.
2. On HTTP 5xx, network timeout, or malformed-JSON body (NOT on `200 OK` with `errors[]`) → retry **once** against the replica URL for that chain.
3. Both fail → surface an honest error: "StakeWise subgraph is currently degraded; `app.stakewise.io` is likely also affected; retry shortly." Do **not** synthesize an answer.

What is NOT a reason to rotate: a `200 OK` with `{"errors":[...]}` body (GraphQL validation error — fix the query), or `data: { entity: null }` (entity simply doesn't exist — answer accordingly).

Replica caveats:
- **Different deployment hash** than primary — schema-compatible today (verified 2026-05-12 via field-shape parity probe), but a breaking subgraph deploy could land on primary first and the replica may briefly serve stale shapes. If the same query succeeds against primary and fails against replica with a field-not-found error, that's the cause; surface as "subgraph deployment in transition".
- **~1 block lag** is typical and harmless for everything except "did my just-confirmed tx show up?" style checks — for those, probe `Checkpoint.timestamp` and warn the user.
- **Path is hardcoded per network** — do not assume `…/prod` works on replica for Mainnet/Gnosis (it currently returns "deployment does not exist"), and do not assume `…/stage` is the right replica path for Hoodi (use `…/prod` there).

### Staging (debug only)

| Network | URL |
|---|---|
| Mainnet | `https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/stage` |
| Gnosis | `https://graphs.stakewise.io/gnosis/subgraphs/name/stakewise/stage` |
| Hoodi | `https://graphs.stakewise.io/hoodi/subgraphs/name/stakewise/stage` |

### Usage

POST a GraphQL body, content type `application/json`:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ vaults(first:3,orderBy:totalAssets,orderDirection:desc){ id displayName apy totalAssets } }"}' \
  https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod
```

Response shape:

```json
{ "data": { "vaults": [ { "id": "0x...", "displayName": "Genesis Vault", "apy": "2.71", "totalAssets": "1234..." } ] } }
```

On schema/query error the shape is `{ "errors": [...] }` instead of `data`.

## Backend GraphQL (validators + boost-dashboard)

Lives at a different host. Use for queries that don't exist in the subgraph — currently: paginated validators per vault, and the boost-dashboard time-series.

| Network | URL |
|---|---|
| Mainnet | `https://mainnet-api.stakewise.io/graphql` |
| Gnosis | `https://gnosis-api.stakewise.io/graphql` |
| Hoodi | `https://hoodi-api.stakewise.io/graphql` |

POST the same way as the subgraph. **Confirmed available queries** (verified via introspection 2026-05-12):

| Query | Args | Returns / fields | Use case |
|---|---|---|---|
| `vaults` | `id: String, skip, first, hidden: Boolean, blacklisted: Boolean` | `[VaultQL]` (probe further fields via introspection — UI uses `blacklisted, hidden, verified, mevMissed, avgExitQueueLength, ogImageUrl` among others) | Detect UI blacklist (`vaults(blacklisted: true)` returns the hidden list); real exit-queue ETA (`avgExitQueueLength` is in **seconds**); MEV missed lifetime; verified operator badge |
| `vaultValidators` | `vaultAddress, statusIn, statusNotIn, first, skip` | `[{ publicKey, apr, income, createdAt }]` | Per-vault validator list. `income` is lifetime in wei. |
| `ofacAddresses` | (no args) | `[String]` of sanctioned addresses | Compliance check — UI blocks wallet connect for these addresses |
| `exitStats` | (no args) | `ExitStatsQL { duration: Int! }` — global average exit-queue **duration in seconds** (Mainnet 2026-05-12: `776270` ≈ 9 days) | Use as the cross-vault fallback ETA when neither `ExitRequest.withdrawalTimestamp` nor per-vault `avgExitQueueLength` is available |
| `scoringDetails` | `vaultAddress: String!` | `ScoringDetailsQL { attestationsEarned: Wei!, attestationsMissed: Wei!, proposedBlockCount: Int!, missedBlockCount: Int! }` — **validator performance breakdown**, not score-formula breakdown | "How did this vault's validators perform recently?" (used by the UI tooltip for the Performance card) |
| `profile` | `account: String!` | `ProfileQL { account: String!, emailAddress: String }` — **email-subscription preferences only**, nothing UI-personalisation about labels | Useful if the user wants to know whether their email is registered for notifications |

Field shapes for fields the skill commonly needs:

```bash
# Backend "vault data" (richer than subgraph for UI-parity questions)
curl -sS -X POST -H 'content-type: application/json' \
  --data '{"query":"{ vaults(id:\"0x...\") { id blacklisted hidden verified mevMissed avgExitQueueLength } }"}' \
  https://mainnet-api.stakewise.io/graphql

# Average exit queue ETA — this is what the UI uses when withdrawalTimestamp is null
# avgExitQueueLength returns seconds, e.g. 149398 ≈ 41.5 hours for Genesis vault on 2026-05-12
# IMPORTANT: avgExitQueueLength is vault-wide average, NOT user-specific
# Prefer ExitRequest.withdrawalTimestamp from subgraph for user-specific ETA; fall back to this vault avg
```

`exitStats.duration` semantics: a network-wide rolling average of how long it took recently-processed exit requests to complete, across all vaults. Use only when neither user-specific (`withdrawalTimestamp`) nor vault-specific (`avgExitQueueLength`) is available, and word it as "across the network" so the user understands the granularity.

`scoringDetails` — despite the name it is NOT a breakdown of `Vault.score`'s 0–100 number. It exposes raw validator-attestation counters for the vault's validators over a recent window. The UI uses it to populate the "Validators performance" sub-card. If the user asks "why does this vault score 99.65 vs another at 87?" the backend does not expose a formula — the answer is "the score combines validator uptime, slashing history, fee, and operator reputation; the underlying validator performance numbers are visible via `scoringDetails`".

The boost-dashboard chart is served by a separate REST endpoint `/api/boostDashboard?from=ISO&to=ISO` and is **out of v0 scope** (also: that page is a static two-account demo, not user-specific).

## Public RPC (on-chain reads only when subgraph cannot answer)

Used only when the question requires `eth_call` against contracts the subgraph doesn't expose (e.g. `mintTokenController.convertToAssets(shares)` for share→asset rate).

See `rpc-fallback.md` for the bundled rotation list and the dynamic-discovery procedure via `chainid.network`.

## Source of truth

The canonical list of endpoints used by `@stakewise/v3-sdk` lives at the **`main` branch** of `stakewise/v3-sdk`, files `src/helpers/configs/{mainnet,gnosis,hoodi}.ts` (fields `api.subgraph` — string or `[primary, replica]` array — and `api.backend`). If anything below diverges from there, the SDK config wins.

### Canonical files (live, `main` branch)

| Network | View (human) | Raw (LLM `WebFetch`) |
|---|---|---|
| Mainnet | `https://github.com/stakewise/v3-sdk/blob/main/src/helpers/configs/mainnet.ts` | `https://raw.githubusercontent.com/stakewise/v3-sdk/main/src/helpers/configs/mainnet.ts` |
| Gnosis | `https://github.com/stakewise/v3-sdk/blob/main/src/helpers/configs/gnosis.ts` | `https://raw.githubusercontent.com/stakewise/v3-sdk/main/src/helpers/configs/gnosis.ts` |
| Hoodi | `https://github.com/stakewise/v3-sdk/blob/main/src/helpers/configs/hoodi.ts` | `https://raw.githubusercontent.com/stakewise/v3-sdk/main/src/helpers/configs/hoodi.ts` |

**When to fetch these at runtime** — the bundled tables above are the fast path and should be your default. Open the raw URL only when:

- The user reports an error suggesting an endpoint has moved (e.g. "the URL in your answer returns 404").
- This skill's bundled `metadata.subgraphSchemaDate` in `plugin.json` is more than ~30 days old (the bundled table may be lagging the SDK).
- A primary URL has been failing for >24h on a network that should have one (anomaly worth double-checking against the SDK source).

The raw files are small (each ~3 KB) and parse with a single `api: { backend: '...', subgraph: '...' | [...] }` look-up. Do not re-fetch on every query — it adds 1–2 s of latency for no benefit when the bundled table is current.

### Maintenance contract

When `main` of `stakewise/v3-sdk` changes a subgraph or backend URL, this skill must be updated **in lock-step**. The change touches three files in `data-skill/`:

1. **`SKILL.md`** — `## Endpoints — quick reference` table (rows: subgraph primary, subgraph replica, backend GraphQL).
2. **`references/endpoints.md`** — Production table, Replica fallback table, Backend GraphQL table.
3. **`llm-context.md`** — both sections above are concatenated in; regenerate or hand-edit the mirrored sections.

After any URL edit:

- **Live-verify the new URLs** with the sanity probe in `### Replica fallback` (compare `_meta.block.number` between primary and replica; expect ≤ 2-block delta and identical schema-shape on a `vaults(first:1)` probe).
- **Re-run the cookbook smoke** against all three chains (the daily `verify-queries.yml` workflow does this, but a one-shot manual `bash scripts/verify-queries.sh` after the edit catches regressions before CI does).
- **Bump the skill version** in `data-skill/.claude-plugin/plugin.json` — minor for an added URL (e.g. new chain), major for a renamed/removed host (breaking for consumers that hardcoded the old one).

SDK URL drift is detected on the consumer side: the `pre-push` hook in `stakewise/frontwise` (`scripts/check-skill-drift.sh`) runs at the moment the `apps/v3-sdk` submodule pointer is bumped and prints an advisory when `helpers/configs/*.ts` changed between the old and new SDK commits. Use that signal to decide whether to update the bundled tables above. This repo's `verify-queries.yml` covers schema-snapshot and live-endpoint health; it does not track the SDK npm version.
