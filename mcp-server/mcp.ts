#!/usr/bin/env npx tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'

import {
  saveAddress,
  getUserStats,
  getVaultData,
  getVaultStats,
  getVaultQueue,
  getVaultsList,
  getVaultBalance,
  getCreatedVaults,
  getVaultsWithStake,
  getVaultWhitelist,
} from './utils/methods'
import type { ResponseInput, ResponseFn } from './utils/types'

import { version } from './package.json'


const callHandler = (
  handler: (url: URL, response: ResponseFn) => void | Promise<void>,
  params: Record<string, string> = {}
): Promise<ResponseInput> => {
  const url = new URL('http://localhost')

  for (const [ key, value ] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return new Promise((resolve) => {
    handler(url, (result) => resolve(result))
  })
}

const formatResponse = (result: ResponseInput) => {
  if (result.error) {
    return { content: [ { type: 'text' as const, text: `Error: ${result.error}` } ] }
  }

  const parts: string[] = []

  if (result.result) {
    parts.push(result.result)
  }

  if (result.data) {
    const json = JSON.stringify(
      result.data,
      (_, v) => typeof v === 'bigint' ? String(v) : v,
      2
    )

    parts.push('```json\n' + json + '\n```')
  }

  return { content: [ { type: 'text' as const, text: parts.join('\n\n') || 'OK' } ] }
}

const vaultAddressSchema = z.object({
  vaultAddress: z.string().describe('Vault Ethereum address (0x...)'),
})

const vaultAddressWithDaysSchema = z.object({
  vaultAddress: z.string().describe('Vault Ethereum address (0x...)'),
  days: z.string().optional().describe('Number of days (1-365, default 30)'),
})

const server = new McpServer({
  name: 'stakewise-llm-tools',
  version,
})

server.registerTool(
  'save_address',
  {
    description: 'Save the user Ethereum wallet address for subsequent queries.',
    inputSchema: z.object({
      address: z.string().describe('Ethereum wallet address (0x...)'),
    }),
  },
  async ({ address }) => formatResponse(await callHandler(saveAddress, { address }))
)

server.registerTool(
  'vaults_list',
  {
    description: 'List all StakeWise vaults sorted by APY descending.',
  },
  async () => formatResponse(await callHandler(getVaultsList))
)

server.registerTool(
  'vault_data',
  {
    description: 'Get public vault info — APY, fee, capacity, osETH minting config.',
    inputSchema: vaultAddressSchema,
  },
  async ({ vaultAddress }) => formatResponse(
    await callHandler(getVaultData, { vaultAddress })
  )
)

server.registerTool(
  'vault_stats',
  {
    description: 'Historical vault performance by day — APY, TVL, and rewards.',
    inputSchema: vaultAddressWithDaysSchema,
  },
  async ({ vaultAddress, days }) => {
    const params: Record<string, string> = { vaultAddress }
    if (days) params.days = days
    return formatResponse(await callHandler(getVaultStats, params))
  }
)

server.registerTool(
  'user_stats',
  {
    description: 'Historical user performance in a vault — personal APY, balance, rewards. Requires save_address first.',
    inputSchema: vaultAddressWithDaysSchema,
  },
  async ({ vaultAddress, days }) => {
    const params: Record<string, string> = { vaultAddress }
    if (days) params.days = days
    return formatResponse(await callHandler(getUserStats, params))
  }
)

server.registerTool(
  'staked_vaults',
  {
    description: 'List every vault where the user has a position with per-vault details. Requires save_address first.',
  },
  async () => formatResponse(await callHandler(getVaultsWithStake))
)

server.registerTool(
  'vault_balance',
  {
    description: 'Detailed user position in one vault — stake, osETH, rewards, APY. Requires save_address first.',
    inputSchema: vaultAddressSchema,
  },
  async ({ vaultAddress }) => formatResponse(
    await callHandler(getVaultBalance, { vaultAddress })
  )
)

server.registerTool(
  'vault_queue',
  {
    description: 'Status of the unstake and unboost queues for one vault. Requires save_address first.',
    inputSchema: vaultAddressSchema,
  },
  async ({ vaultAddress }) => formatResponse(
    await callHandler(getVaultQueue, { vaultAddress })
  )
)

server.registerTool(
  'created_vaults',
  {
    description: 'List vault addresses created (administered) by the user. Requires save_address first.',
  },
  async () => formatResponse(await callHandler(getCreatedVaults))
)

server.registerTool(
  'vault_whitelist',
  {
    description: 'Whitelist of addresses allowed to stake in a private vault.',
    inputSchema: vaultAddressSchema,
  },
  async ({ vaultAddress }) => formatResponse(
    await callHandler(getVaultWhitelist, { vaultAddress })
  )
)

const main = async () => {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[stakewise-llm-tools] MCP server started on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
