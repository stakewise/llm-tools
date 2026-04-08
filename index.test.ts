import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import http from 'node:http'

const mockConnect = vi.fn()
const mockInit = vi.fn()

vi.mock('@walletconnect/sign-client', () => ({
  default: {
    init: (...args: any[]) => mockInit(...args),
  },
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,MOCK_QR_DATA'),
  },
}))

vi.mock('openclaw/plugin-sdk/plugin-entry', () => ({
  definePluginEntry(opts: any) {
    return opts
  },
}))

import pluginEntry from './index.js'

type PluginEntry = typeof pluginEntry & {
  register: (api: any, ctx?: any) => Promise<void>
}

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
    const resetCmd = commands.find((c) => c.name === 'stakewise_reset')
    if (resetCmd) await resetCmd.handler()
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
    it('should register stakewise_reset command', () => {
      expect(commands).toHaveLength(1)
      expect(commands[0].name).toBe('stakewise_reset')
    })

    it('should have a description', () => {
      expect(commands[0].description).toBeTruthy()
    })
  })

  describe('GET /health', () => {
    it('should return ok', async () => {
      const { status, body } = await fetch('/health')

      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.plugin).toBe('stakewise-staking')
      expect(body.port).toBe(TEST_PORT)
    })
  })

  // This must run BEFORE /save-address tests so no address is stored yet
  describe('GET /get-balance (no address saved)', () => {
    it('should return 400 when no address is saved', async () => {
      const { status, body } = await fetch('/get-balance')

      expect(status).toBe(400)
      expect(body.ok).toBe(false)
      expect(body.error).toBeTruthy()
    })
  })

  describe('GET /save-address', () => {
    it('should save a valid address', async () => {
      const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
      const { status, body } = await fetch(`/save-address?address=${addr}`)

      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.result).toContain('successfully saved')
    })

    it('should reject an invalid address', async () => {
      const { status, body } = await fetch('/save-address?address=not-an-address')

      expect(status).toBe(400)
      expect(body.ok).toBe(false)
      expect(body.error).toBeTruthy()
    })

    it('should reject a missing address', async () => {
      const { status, body } = await fetch('/save-address')

      expect(status).toBe(400)
      expect(body.ok).toBe(false)
    })
  })

  // This must run BEFORE /connect tests so no connection is pending
  describe('GET /connect-status (no connection)', () => {
    it('should return not connected when no session exists', async () => {
      const { status, body } = await fetch('/connect-status')

      expect(status).toBe(200)
      expect(body.connected).toBe(false)
      expect(body.pending).toBe(false)
    })
  })

  describe('GET /connect', () => {
    it('should return QR code and URI on successful connect', async () => {
      const mockUri = 'wc:abc123@2?relay-protocol=irn&symKey=xyz'

      mockInit.mockResolvedValue({
        connect: mockConnect,
      })
      mockConnect.mockResolvedValue({
        uri: mockUri,
        approval: () => new Promise(() => {}), // never resolves (pending)
      })

      const { status, body } = await fetch('/connect')

      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.uri).toBe(mockUri)
      expect(body.qrBase64).toContain('data:image/png;base64,')
      expect(body.result).toBeTruthy()
    })

    it('should return 409 when a connection is already pending', async () => {
      const { status, body } = await fetch('/connect')

      expect(status).toBe(409)
      expect(body.ok).toBe(false)
      expect(body.error).toContain('already pending')
    })
  })

  describe('GET /connect-status (pending)', () => {
    it('should return pending when waiting for approval', async () => {
      const { status, body } = await fetch('/connect-status')

      expect(status).toBe(200)
      expect(body.connected).toBe(false)
      expect(body.pending).toBe(true)
    })
  })

  describe('GET /unknown', () => {
    it('should return 404', async () => {
      const { status, body } = await fetch('/unknown')

      expect(status).toBe(404)
      expect(body.ok).toBe(false)
      expect(body.error).toBe('Not found')
    })
  })

  describe('POST /health', () => {
    it('should return 404', async () => {
      const { status, body } = await fetch('/health', 'POST')

      expect(status).toBe(404)
      expect(body.ok).toBe(false)
    })
  })

  describe('stakewise_reset command', () => {
    it('should return confirmation text', async () => {
      const resetCmd = commands.find((c) => c.name === 'stakewise_reset')
      const result = await resetCmd.handler()

      expect(result.text).toContain('restarted')
    })

    it('should have a working server after reset', async () => {
      await new Promise((r) => setTimeout(r, 50))

      const { status, body } = await fetch('/health')
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })
})
