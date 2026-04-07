import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'

import pluginEntry from './index.js'

type PluginEntry = typeof pluginEntry & {
  register: (api: any, ctx?: any) => Promise<void>
}

vi.mock('openclaw/plugin-sdk/plugin-entry', () => ({
  definePluginEntry(opts: any) {
    return opts
  },
}))

const TEST_PORT = 5055
const TEST_HOST = '127.0.0.1'
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`

function fetch(path: string, method = 'GET'): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${path}`, { method }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        resolve({ status: res.statusCode!, body: JSON.parse(data) })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

describe('StakeWise Staking Plugin', () => {
  const commands: any[] = []
  const mockApi = {
    registerCommand: (cmd: any) => commands.push(cmd),
  }

  beforeAll(async () => {
    await (pluginEntry as PluginEntry).register(mockApi as any, {
      config: { port: TEST_PORT, host: TEST_HOST },
    })
  })

  afterAll(async () => {
    // Trigger reset command's stopServer via handler, then stop again
    const resetCmd = commands.find((c) => c.name === 'stakewise-reset')
    if (resetCmd) await resetCmd.handler()
  })

  afterEach(() => {
    // keep commands array intact between tests
  })

  describe('plugin entry metadata', () => {
    it('should have correct id, name and description', () => {
      expect(pluginEntry.id).toBe('stakewise-staking')
      expect(pluginEntry.name).toBe('Stakewise Staking')
      expect(pluginEntry.description).toContain('Stakewise')
    })

    it('should have a register function', () => {
      expect(typeof pluginEntry.register).toBe('function')
    })
  })

  describe('command registration', () => {
    it('should register stakewise-reset command', () => {
      expect(commands).toHaveLength(1)
      expect(commands[0].name).toBe('stakewise-reset')
    })

    it('should have a description', () => {
      expect(commands[0].description).toBeTruthy()
    })
  })

  describe('HTTP server', () => {
    it('GET /health should return ok', async () => {
      const { status, body } = await fetch('/health')

      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.plugin).toBe('stakewise-staking')
      expect(body.port).toBe(TEST_PORT)
    })

    it('GET /get-balance should return mock balance', async () => {
      const { status, body } = await fetch('/get-balance')

      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.result).toContain('Balance')
      expect(body.result).toContain('ETH')
    })

    it('GET /unknown should return 404', async () => {
      const { status, body } = await fetch('/unknown')

      expect(status).toBe(404)
      expect(body.ok).toBe(false)
      expect(body.error).toBe('Not found')
    })

    it('POST /health should return 404', async () => {
      const { status, body } = await fetch('/health', 'POST')

      expect(status).toBe(404)
      expect(body.ok).toBe(false)
    })
  })

  describe('stakewise-reset command', () => {
    it('should return confirmation text', async () => {
      const resetCmd = commands.find((c) => c.name === 'stakewise-reset')
      const result = await resetCmd.handler()

      expect(result.text).toContain('restarted')
    })

    it('should have a working server after reset', async () => {
      // Give the server a moment to be fully ready
      await new Promise((r) => setTimeout(r, 50))

      const { status, body } = await fetch('/health')
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })
})
