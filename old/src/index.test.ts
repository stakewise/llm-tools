import { describe, it, expect, vi, beforeEach } from 'vitest'

import pluginEntry from './index.js'


vi.mock('openclaw/plugin-sdk/plugin-entry', () => ({
  definePluginEntry(opts: any) {
    return opts
  },
}))


function getRegisteredTools() {
  const tools: any[] = []
  const mockApi = {
    registerTool: (tool: any) => tools.push(tool),
  }
  pluginEntry.register(mockApi as any)
  return tools
}

describe('StakeWise Staking Plugin', () => {
  describe('plugin entry metadata', () => {
    it('should have correct id, name and description', () => {
      expect(pluginEntry.id).toBe('stakewise-staking-plugin')
      expect(pluginEntry.name).toBe('StakeWise Tools')
      expect(pluginEntry.description).toContain('StakeWise')
    })

    it('should have a register function', () => {
      expect(typeof pluginEntry.register).toBe('function')
    })
  })

  describe('tool registration', () => {
    it('should register Get balance tool', () => {
      const tools = getRegisteredTools()

      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('stakewise_getBalance')
    })

    it('should have proper label and description', () => {
      const tools = getRegisteredTools()

      expect(tools[0].label).toBe('StakeWise — Get staking balance')
      expect(tools[0].description).toContain('StakeWise')
    })

    it('should define address and network parameters', () => {
      const tools = getRegisteredTools()
      const params = tools[0].parameters

      expect(params.properties.address).toBeDefined()
      expect(params.properties.network).toBeDefined()
    })
  })

  describe('Get balance execute', () => {
    let execute: (id: string, params: any) => Promise<any>

    beforeEach(() => {
      const tools = getRegisteredTools()

      execute = tools[0].execute
    })

    it('should reject unsupported network', async () => {
      const result = await execute('test-1', {
        address: '0xEC01cB780202595Ce2Fb11225aABfAd201B54e0f',
        network: 'polygon',
      })

      expect(result.content[0].text).toContain('not supported')
      expect(result.details).toBeNull()
    })

    it('should reject invalid address', async () => {
      const result = await execute('test-2', {
        address: '0xINVALID',
        network: 'mainnet',
      })
      expect(result.content[0].text).toContain('Invalid')
      expect(result.details).toBeNull()
    })

    it('should reject empty address', async () => {
      const result = await execute('test-3', {
        address: '',
        network: 'mainnet',
      })
      expect(result.content[0].text).toContain('Invalid')
    })

    it('should return staking balance for a valid mainnet address', async () => {
      const result = await execute('test-4', {
        address: '0xEC01cB780202595Ce2Fb11225aABfAd201B54e0f',
        network: 'mainnet',
      })

      expect(result.content[0].text).toContain('Staking balance for')
      expect(result.content[0].text).toContain('mainnet')
      expect(result.content[0].text).toContain('ETH')
      expect(result.details).toBeDefined()
      expect(result.details.depositToken).toBe('ETH')
      expect(result.details.status).toMatch(/^(active|inactive)$/)
      expect(Number(result.details.stakedAssets)).toBeGreaterThan(0)
      expect(Number(result.details.earnedAssets)).toBeGreaterThan(0)
    }, 30000)

    it('should return zero balance for an address with no stake', async () => {
      const result = await execute('test-5', {
        address: '0x0000000000000000000000000000000000000001',
        network: 'mainnet',
      })

      expect(result.content[0].text).toContain('Staking balance for')
      expect(result.details.stakedAssets).toBe('0.0')
      expect(result.details.status).toBe('inactive')
    }, 30000)

    it('should handle missing network parameter', async () => {
      const result = await execute('test-6', {
        address: '0xEC01cB780202595Ce2Fb11225aABfAd201B54e0f',
        network: '',
      })

      expect(result.content[0].text).toContain('not supported')
    })

    it('should handle network case-insensitively', async () => {
      const result = await execute('test-7', {
        address: '0x0000000000000000000000000000000000000001',
        network: 'Mainnet',
      })

      expect(result.content[0].text).toContain('Staking balance')
      expect(result.details.status).toBe('inactive')
    }, 30000)
  })
})
