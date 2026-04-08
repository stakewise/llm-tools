import QRCode from 'qrcode'
import http, { ServerResponse } from 'node:http'
import { SignClient } from '@walletconnect/sign-client'
import { StakeWiseSDK, Network } from '@stakewise/v3-sdk'
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import { getAddress, isAddress, formatEther, parseEther } from 'ethers'

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'
import type { SessionTypes } from '@walletconnect/types'



const CONNECT_TIMEOUT_MS = 5 * 60 * 1000

type RuntimeState = {
  server?: http.Server
  starting?: Promise<void>
  host: string
  port: number
  address?: string
  signClient?: InstanceType<typeof SignClient>
  session?: SessionTypes.Struct
  connectPending?: boolean
  connectTimer?: ReturnType<typeof setTimeout>
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

    if (req.method === 'GET' && url.pathname === '/connect') {
      if (state.connectPending) {
        response({
          code: 409,
          error: 'A connection request is already pending. Check /connect-status or wait for it to expire.',
        })
        return
      }

      try {
        if (!state.signClient) {
          state.signClient = await SignClient.init({
            projectId: 'f8110120a5a7b0ac720b64660b48cab7',
            metadata: {
              url: 'https://stakewise.io',
              name: 'StakeWise Staking Plugin',
              description: 'Stake ETH through StakeWise protocol',
              icons: ['https://stakewise.io/logo512.png'],
            },
          })
        }

        const { uri, approval } = await state.signClient.connect({
          optionalNamespaces: {
            eip155: {
              methods: ['eth_sendTransaction', 'personal_sign'],
              events: ['accountsChanged', 'chainChanged'],
              chains: ['eip155:1'],
            }
          },
        })

        if (!uri) {
          response({ code: 500, error: 'Failed to generate WalletConnect URI' })
          return
        }

        const qrBase64 = await QRCode.toDataURL(uri, { width: 512, margin: 2 })

        state.connectPending = true

        state.connectTimer = setTimeout(() => {
          state.connectPending = false
          state.connectTimer = undefined
        }, CONNECT_TIMEOUT_MS)

        approval().then((session: SessionTypes.Struct) => {
          clearTimeout(state.connectTimer)
          state.connectTimer = undefined
          state.connectPending = false
          state.session = session

          const account = session.namespaces.eip155?.accounts?.[0]
          if (account) {
            const rawAddress = account.split(':')[2]
            if (isAddress(rawAddress)) {
              state.address = getAddress(rawAddress)
            }
          }
        }).catch(() => {
          state.connectPending = false
          clearTimeout(state.connectTimer)
          state.connectTimer = undefined
        })

        response({
          uri,
          qrBase64,
          result: 'Show the QR code image to the user so they can scan it with their wallet app. The image is in qrBase64 field (data URI). Also provide the uri as a clickable link for mobile users.',
        })
      } catch (err: any) {
        state.connectPending = false
        response({ code: 500, error: err.message || 'WalletConnect initialization failed' })
      }

      return
    }

    if (req.method === 'GET' && url.pathname === '/connect-status') {
      if (state.session && state.address) {
        response({
          connected: true,
          address: state.address,
          result: `Wallet connected successfully. Address: ${state.address}`,
        })
      } else if (state.connectPending) {
        response({
          connected: false,
          pending: true,
          result: 'Waiting for the user to scan QR code and approve the connection in their wallet.',
        })
      } else {
        response({
          connected: false,
          pending: false,
          result: 'No active connection. Use /connect to start a new connection.',
        })
      }

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
