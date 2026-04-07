import http from 'node:http'
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'

type PluginApi = {
  registerCommand: (name: string, options: { description?: string; handler: (args: string, ctx: any) => Promise<void> }) => void
}

type RuntimeState = {
  server?: http.Server
  starting?: Promise<void>
  host: string
  port: number
}

const state: RuntimeState = {
  host: '127.0.0.1',
  port: 5005,
}

function createServer() {
  return http.createServer((req: any, res: any) => {
    const url = new URL(req.url ?? '/', `http://${state.host}:${state.port}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, plugin: 'stakewise-staking', port: state.port }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/get-balance') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, result: '[mock response]: Balance 0.1 ETH' }))
      return
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  })
}

async function stopServer() {
  if (!state.server) return
  const server = state.server
  state.server = undefined
  state.starting = undefined
  await new Promise<void>((resolve, reject) => {
    server.close((err: any) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

async function ensureServerRunning() {
  if (state.server?.listening) return

  if (state.starting) return state.starting

  state.starting = new Promise<void>((resolve, reject) => {
    const server = createServer()

    const onError = (err: Error) => {
      state.starting = undefined
      if ((err as any).code === 'EADDRINUSE') {
        console.log(`[stakewise-staking] server already running on ${state.host}:${state.port}`)
        resolve()
        return
      }
      reject(err)
    }

    server.once('error', onError)

    server.listen(state.port, state.host, () => {
      server.off('error', onError)
      state.server = server
      state.starting = undefined
      console.log(`[stakewise-staking] server listening on http://${state.host}:${state.port}`)
      resolve()
    })
  })

  return state.starting
}

export default definePluginEntry({
  id: 'stakewise-staking',
  name: 'Stakewise Staking',
  description: 'Starts a local Stakewise API server and adds a reset command plus skill',
  async register(api: PluginApi, ctx?: { config?: { port?: number; host?: string } }) {
    state.port = ctx?.config?.port ?? 5005
    state.host = ctx?.config?.host ?? '127.0.0.1'

    await ensureServerRunning()

    api.registerCommand('stakewise-reset', {
      description: 'Restart the local Stakewise mock API server.',
      handler: async (_args, commandCtx) => {
        await stopServer()
        await ensureServerRunning()
        commandCtx?.ui?.notify?.(`Stakewise server restarted on http://${state.host}:${state.port}`, 'info')
      },
    })
  },
})
