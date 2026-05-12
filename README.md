# StakeWise LLM Tools

Real-time [StakeWise](https://stakewise.io) protocol data for AI assistants. Query vault APYs, user balances, staking rewards, osETH positions, withdrawal queues, and more — directly from the model.

This repo ships **two ways** to query StakeWise from an LLM:

1. **MCP server** (`@stakewise/llm-tools` on npm) — heavy path with 10 live tools, in-memory state, slash commands. Best when your environment has Node.js + a MCP-compatible client (Claude Code, Cursor, Codex, OpenClaw). Lives in [`mcp-server/`](./mcp-server).

2. **`stakewise-data-query` skill** — lightweight path. No Node, no `npx`, no local server. Just markdown that instructs any LLM to query the public StakeWise subgraphs directly via WebFetch / curl. Works in Claude Code (plugin install) **and** in browser ChatGPT, Perplexity, DeepSeek, Cursor without MCP, anywhere markdown can land in a context window. Lives in [`data-skill/`](./data-skill).

Both products use the same maintenance pipeline (daily drift check, schema snapshot, cookbook verification).

### What the model can do

- Look up any StakeWise vault — APY, TVL, fee, capacity, osETH minting config
- Show all vaults sorted by APY or browse the full vault list
- Check a user's staked balance, minted/boosted osETH, and earned rewards across all vaults
- Track historical vault performance and personal earnings over time (daily breakdown)
- Monitor unstake and unboost queue status
- Check private vault whitelist and whether a user is whitelisted
- List vaults created (administered) by a given address

## Setup — option A: lightweight skill (zero install for the user)

Use this when you want any LLM to answer StakeWise questions, including environments without Node/MCP.

### Claude Code (plugin)

```bash
/plugin marketplace add stakewise/llm-tools
/plugin install stakewise-data-query@stakewise-llm-tools
```

The skill activates automatically when the user asks about StakeWise APY, balances, exit queue, osETH health, boost, claims, vesting, etc.

### Any other LLM (ChatGPT, Perplexity, DeepSeek, Cursor without MCP)

Paste this URL into the system prompt, Custom GPT instructions, Perplexity Space Source, or Cursor `@-mention`:

```
https://raw.githubusercontent.com/stakewise/llm-tools/main/data-skill/llm-context.md
```

That single file (~1600 lines, ~56 KB) bundles `SKILL.md` plus all references. The LLM then has everything it needs to build correct GraphQL queries against `graphs.stakewise.io/{mainnet,gnosis,hoodi}/...` and read the response.

## Setup — option B: MCP server (richer integration, requires Node)

Use this when your environment has Node + an MCP-compatible client and you want the model to call typed tools with live state (saved address, slash commands).

### OpenClaw

OpenClaw's `api.registerTool` does not reliably expose MCP tools to the model. This plugin works around the issue by running a local HTTP server on port **5165** and using a skill file that instructs the model to call endpoints via `curl`.

Install the plugin:

```bash
openclaw plugins install clawhub:stakewise-llm-tools
```

Allow the model to execute `curl` against the local server:

```bash
openclaw config set tools.exec.security full
openclaw config set tools.exec.ask off
```

> See [openclaw#25652](https://github.com/openclaw/openclaw/issues/25652) for background on why this is required.

Restart the gateway and start a new conversation:

```bash
openclaw gateway restart
```

Then type `/new` in the chat to begin a fresh session with the plugin loaded.

### Claude Code

Requires [tsx](https://github.com/privatenumber/tsx) installed globally:

```bash
npm i -g tsx
```

Create a `.mcp.json` file in the root of any project where you want to use these tools:

```json
{
  "mcpServers": {
    "stakewise-llm-tools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@stakewise/llm-tools"]
    }
  }
}
```

Restart Claude Code to apply.

### Cursor

Go to **Settings → Tools & MCPs → New MCP Server**, and add to the opened `mcp.json`:

```json
{
  "mcpServers": {
    "stakewise-llm-tools": {
      "command": "npx",
      "args": ["-y", "@stakewise/llm-tools"]
    }
  }
}
```

### Codex

Add to `.codex/config.toml` in your project root:

```toml
[mcp_servers.stakewise-llm-tools]
command = "npx"
args = ["-y", "@stakewise/llm-tools"]
```

## Available MCP tools (option B)

| Tool | Description | Requires address |
|---|---|---|
| `save_address` | Save user wallet for subsequent queries | No |
| `vaults_list` | All StakeWise vaults sorted by APY | No |
| `vault_data` | Public vault info (APY, fee, capacity, osETH config) | No |
| `vault_stats` | Historical vault performance (daily APY, TVL, rewards) | No |
| `vault_whitelist` | Whitelist for a private vault | No |
| `staked_vaults` | All vaults where the user has a position | Yes |
| `vault_balance` | User's detailed position in a specific vault | Yes |
| `vault_queue` | Unstake & unboost queue status | Yes |
| `user_stats` | User's personal earnings history in a vault | Yes |
| `created_vaults` | Vaults administered by the user | Yes |

## Example Prompts

- "Show me the top StakeWise vaults by APY"
- "What's my staking balance?" (the model will ask for your address first)
- "How has Genesis Vault performed over the last 7 days?"
- "Show my rewards in vault 0x..."
- "Is my withdrawal ready?"
- "Which vaults did I create?"
- "Am I whitelisted in this vault?"

## Requirements

- **Option A (skill)**: no install required — just an LLM that can read markdown and make HTTP calls. Claude Code users get plugin auto-activation.
- **Option B (MCP server)**: Node.js >= 20, and [tsx](https://github.com/privatenumber/tsx) installed globally.

## Repo layout

```
llm-tools/
├── mcp-server/                # @stakewise/llm-tools npm package — MCP server
├── data-skill/                # stakewise-data-query — standalone Claude Code skill
│   ├── SKILL.md               # plugin-root skill entry
│   ├── llm-context.md         # universal bundle for non-Claude LLMs
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── references/            # endpoints, entities, cookbook, units, RPC, schema
├── .claude-plugin/            # Claude Code marketplace manifest
│   └── marketplace.json
├── scripts/                   # build, verify, snapshot, lint
└── .github/workflows/         # publish (existing) + drift-check + skill-lint (new)
```

## Maintenance

A daily GitHub Action ([`.github/workflows/verify-queries.yml`](./.github/workflows/verify-queries.yml)) probes:

- Every cookbook query against prod subgraph on Mainnet, Gnosis, Hoodi
- Replica subgraph parity (block lag, schema-shape match)
- Backend GraphQL schema introspection
- Public RPC liveness (one URL per chain)
- Subgraph schema vs the bundled snapshot

It opens issues labelled `query-broken` / `schema-drift` when anything diverges — it never blocks merges. PRs touching `data-skill/**` or `mcp-server/skills/**` also get an advisory comment via [`.github/workflows/lint-skills.yml`](./.github/workflows/lint-skills.yml).

SDK-version drift and skill-coupled file changes are detected at the source: a `pre-push` hook in `stakewise/frontwise` runs `scripts/check-skill-drift.sh` and surfaces an advisory when the v3-sdk submodule pointer or skill-mirrored web files move. That hook owns the consumer-side drift signal; this repo's CI is for live-endpoint and schema-snapshot checks only.

## License

MIT
