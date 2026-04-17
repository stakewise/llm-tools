# StakeWise LLM Tools

Real-time [StakeWise](https://stakewise.io) protocol data for AI assistants. Query vault APYs, user balances, staking rewards, osETH positions, withdrawal queues, and more — directly from the model.

Works with **Claude Code**, **Cursor**, **Codex**, **OpenClaw**, and any MCP-compatible tool.

### What the model can do

- Look up any StakeWise vault — APY, TVL, fee, capacity, osETH minting config
- Show all vaults sorted by APY or browse the full vault list
- Check a user's staked balance, minted/boosted osETH, and earned rewards across all vaults
- Track historical vault performance and personal earnings over time (daily breakdown)
- Monitor unstake and unboost queue status
- Check private vault whitelist and whether a user is whitelisted
- List vaults created (administered) by a given address

## Setup

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

## Available Tools

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

- Node.js >= 20.0.0
- [tsx](https://github.com/privatenumber/tsx) installed globally (for MCP server mode)

## License

MIT
