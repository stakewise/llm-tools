import http, { ServerResponse } from 'node:http'

import { state } from './state'
import type { ResponseInput, ResponseFn } from './types'
import { saveAddress, getVaultBalance, getVaultsWithStake } from './methods'


const createResponse = (res: ServerResponse): ResponseFn => (values: ResponseInput) => {
  const { code = 200, ...params } = values

  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })

  res.end(JSON.stringify({
    ok: code === 200 ? true : false,
    plugin: 'stakewise-staking',
    ...params,
  }))
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

  if (req.method === 'GET' && url.pathname === '/get-vault-balance') {
    await getVaultBalance(url, response)
    return
  }

  if (req.method === 'GET' && url.pathname === '/get-staked-vaults') {
    await getVaultsWithStake(url, response)
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
