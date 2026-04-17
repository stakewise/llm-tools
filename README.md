# StakeWise Staking Plugin for OpenClaw

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that gives your AI assistant real-time access to the [StakeWise](https://stakewise.io) liquid staking protocol on Ethereum.

The plugin runs a local HTTP server and provides a skill file so the model can autonomously query on-chain data — vault APYs, user balances, staking rewards, osETH positions, withdrawal queues, and more.

### What the model can do with this plugin

- Look up any StakeWise vault — APY, TVL, fee, capacity, osETH minting config
- Show all vaults sorted by APY or browse the full vault list
- Check a user's staked balance, minted/boosted osETH, and earned rewards across all vaults
- Track historical vault performance and personal earnings over time (daily breakdown)
- Monitor unstake and unboost queue status
- List vaults created (administered) by a given address
- Link to DeFi guides for using osETH on Aave, Morpho, Compound, Curve, Balancer, EigenLayer, Symbiotic, and Fluid

## Quick Start

### 1. Install the plugin

```bash
openclaw plugins install clawhub:stakewise-llm-tools
```

### 2. Allow the model to reach the local server

By default, OpenClaw blocks outgoing tool calls for security. This plugin needs the model to run `curl` against `127.0.0.1` to fetch data. Enable full exec permissions:

```bash
openclaw config set tools.exec.security full
openclaw config set tools.exec.ask off
```

> See [openclaw#25652](https://github.com/openclaw/openclaw/issues/25652) for background on why this is required.

### 3. Restart the gateway and start a new conversation

```bash
openclaw gateway restart
```

Then type `/new` in the chat to begin a fresh session with the plugin loaded.

## How It Works

The plugin starts a local HTTP server on port **5165** (configurable). When the model receives a staking-related question, the skill instructs it to call the appropriate endpoint via `curl`, parse the JSON response, and present the data in a readable format.

### Server endpoints

| Endpoint | Description | Requires address |
|---|---|---|
| `/health` | Server health check | No |
| `/save-address?address=0x...` | Save user wallet for subsequent queries | No |
| `/vaults-list` | All StakeWise vaults sorted by APY | No |
| `/vault-data?vaultAddress=0x...` | Public vault info (APY, fee, capacity, osETH config) | No |
| `/vault-stats?vaultAddress=0x...&days=30` | Historical vault performance (daily APY, TVL, rewards) | No |
| `/staked-vaults` | All vaults where the user has a position | Yes |
| `/vault-balance?vaultAddress=0x...` | User's detailed position in a specific vault | Yes |
| `/vault-queue?vaultAddress=0x...` | Unstake & unboost queue status | Yes |
| `/user-stats?vaultAddress=0x...&days=30` | User's personal earnings history in a vault | Yes |
| `/created-vaults` | Vaults administered by the user | Yes |
| `/vault-whitelist?vaultAddress=0x...` | Whitelist for a private vault | No |

All responses return JSON with `ok`, `data`, and a human-readable `result` field.

## Example Prompts

Once the plugin is installed, try asking the model:

- "Show me the top StakeWise vaults by APY"
- "What's my staking balance?" (the model will ask for your address first)
- "How has Genesis Vault performed over the last 7 days?"
- "Show my rewards in vault 0x..."
- "Is my withdrawal ready?"
- "Which vaults did I create?"
- "What can I do with my osETH in DeFi?"

## Configuration

The server host and port can be customized in `openclaw.plugin.json`:

```json
{
  "configSchema": {
    "properties": {
      "port": { "type": "number", "default": 5165 },
      "host": { "type": "string", "default": "127.0.0.1" }
    }
  }
}
```

## Requirements

- Node.js >= 20.0.0
- OpenClaw >= 2026.4.2

## License

MIT
