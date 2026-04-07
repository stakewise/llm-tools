import http, { ServerResponse } from 'node:http'
import { StakeWiseSDK, Network } from '@stakewise/v3-sdk'
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import { getAddress, isAddress, formatEther, parseEther } from 'ethers'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'


type RuntimeState = {
  server?: http.Server
  starting?: Promise<void>
  host: string
  port: number
  address?: string
}

const state: RuntimeState = {
  host: '127.0.0.1',
  port: 5005,
}

const minimalAmount = parseEther('0.00001')
const vaultAddress = '0x15639E82d2072Fa510E5d2b5F0db361c823bCad3'

type ResponseInput = Record<string, any> & {
  code?: number
}

const createResponse = (res: ServerResponse) => (values: ResponseInput) => {
  const { code = 200, ...params } = values

  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({
    ok: code === 200 ? true : false,
    plugin: 'stakewise-staking',
    ...params,
  }))
}

function createServer() {
  return http.createServer(async (req: any, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${state.host}:${state.port}`)

    const response = createResponse(res)

    if (req.method === 'GET' && url.pathname === '/health') {
      response({ port: state.port })

      return
    }

    if (req.method === 'GET' && url.pathname === '/save-address') {
      let address = url.searchParams.get('address')

      if (isAddress(address)) {
        state.address = getAddress(address)

        response({
          address,
          result: `The ${state.address} address has been successfully saved`
        })
      }
      else {
        response({
          code: 400,
          error: `
            You did not provide your wallet address, or it was provided in an incorrect format.
            Please provide a valid Ethereum address.
          `
        })
      }

      return
    }

    if (req.method === 'GET' && url.pathname === '/get-balance') {
      if (!isAddress(state.address)) {
        response({
          code: 400,
          error: `
            Address not found.
            Enter the command “Set wallet address for the Stakewise plugin” to save the address. 
          `
        })

        return
      }

      const sdk = new StakeWiseSDK({
        network: Network.Mainnet,
        endpoints: {
          web3: 'https://ethereum-rpc.publicnode.com',
        }
      })

      const { assets, totalEarnedAssets } = await sdk.vault.getStakeBalance({
        userAddress: state.address,
        vaultAddress,
      })

      const data = {
        stakedAssets: formatEther(assets),
        earnedAssets: formatEther(totalEarnedAssets),
        status: minimalAmount < assets ? 'active' : 'inactive',
        depositToken: 'ETH',
      }

      response({
        data,
        result: `
          Staking balance for ${state.address}
          • Total staked: ${data.stakedAssets} ${data.depositToken}
          • Rewards: ${data.earnedAssets} ${data.depositToken}
          • Status: ${data.status}
        `
      })

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
  async register(api: OpenClawPluginApi, ctx?: { config?: { port?: number; host?: string } }) {
    state.port = ctx?.config?.port || 5005
    state.host = ctx?.config?.host || '127.0.0.1'

    await ensureServerRunning()

    api.registerCommand({
      name: 'stakewise_reset',
      description: 'Restart the local Stakewise mock API server.',
      handler: async () => {
        await stopServer()
        await ensureServerRunning()

        return {
          text: 'The stakewise server has been restarted',
        };
      },
    })
  },
})
