import http, { ServerResponse } from 'node:http'

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
} from './methods'
import { state } from './state'
import type { ResponseInput, ResponseFn } from './types'


const serializeBigInts = (input: unknown): unknown => {
  if (typeof input === 'bigint') {
    return String(input)
  }

  if (Array.isArray(input)) {
    return input.map(serializeBigInts)
  }

  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {}

    for (const [ key, value ] of Object.entries(input)) {
      result[key] = serializeBigInts(value)
    }

    return result
  }

  return input
}

const createResponse = (res: ServerResponse): ResponseFn => (values: ResponseInput) => {
  const { code = 200, ...params } = values

  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })

  const payload = serializeBigInts({
    ok: code === 200 ? true : false,
    plugin: 'stakewise-staking',
    ...params,
  })

  res.end(JSON.stringify(payload))
}

const createServer = () => http.createServer(async (req: any, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${state.host}:${state.port}`)
  const response = createResponse(res)

  if (req.method === 'GET' && url.pathname === '/health') {
    response({ port: state.port })
    return
  }

  if (req.method === 'GET' && url.pathname === '/save-address') {
    await saveAddress(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-vault-data') {
    await getVaultData(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-vault-stats') {
    await getVaultStats(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-user-stats') {
    await getUserStats(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-vault-balance') {
    await getVaultBalance(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-vault-queue') {
    await getVaultQueue(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-staked-vaults') {
    await getVaultsWithStake(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-created-vaults') {
    await getCreatedVaults(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/vaults-list') {
    await getVaultsList(url, response)
    return
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'Not found' }))
})

const stopServer = async () => {
  if (!state.server) {
    return
  }

  const server = state.server
  state.server = undefined
  state.starting = undefined

  await new Promise<void>((resolve, reject) => {
    server.close((err: any) => {
      if (err) {
        reject(err)
      }
      else {
        resolve()
      }
    })
  })
}

const ensureServerRunning = async () => {
  if (state.server?.listening) {
    return
  }

  if (state.starting) {
    return state.starting
  }

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


export { stopServer, ensureServerRunning }
