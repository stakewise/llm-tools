import SignClient from '@walletconnect/sign-client'

const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const WALLET_CONNECT_PROJECT_ID = '60c8253e84912956fc991fcb05481f93'


type WalletSession = {
  client: SignClient
  session: any
  address: string
  chainId: number
  connectedAt: number
  lastActivityAt: number
  idleTimer: ReturnType<typeof setTimeout>
}

const sessions = new Map<string, WalletSession>()

function resetIdleTimer(sessionKey: string) {
  const entry = sessions.get(sessionKey)

  if (!entry) return

  clearTimeout(entry.idleTimer)

  entry.lastActivityAt = Date.now()

  entry.idleTimer = setTimeout(() => {
    disconnectWallet(sessionKey)
  }, IDLE_TIMEOUT_MS)
}

export async function createWalletConnectSession(sessionKey: string): Promise<{
  uri: string
  approval: Promise<{ address: string; chainId: number }>
}> {
  // Disconnect existing session if any
  if (sessions.has(sessionKey)) {
    await disconnectWallet(sessionKey)
  }

  const client = await SignClient.init({
    projectId: WALLET_CONNECT_PROJECT_ID,
    metadata: {
      url: 'https://stakewise.io',
      name: 'StakeWise Staking Plugin',
      description: 'Stake ETH through StakeWise protocol',
      icons: [ 'https://stakewise.io/logo512.png' ],
    },
  })

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ['eth_sendTransaction', 'personal_sign'],
        events: ['accountsChanged'],
        chains: ['eip155:1'],
      },
    },
  })

  if (!uri) {
    throw new Error('Failed to generate WalletConnect URI')
  }

  const approvalPromise = approval().then((session) => {
    const accounts = session.namespaces.eip155?.accounts ?? []
    // Format: eip155:1:0xabc...
    const [, chainIdStr, address] = (accounts[0] ?? '').split(':')
    const chainId = Number(chainIdStr) || 1

    const idleTimer = setTimeout(() => {
      disconnectWallet(sessionKey)
    }, IDLE_TIMEOUT_MS)

    sessions.set(sessionKey, {
      client,
      session,
      address,
      chainId,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      idleTimer,
    })

    return { address, chainId }
  })

  return { uri, approval: approvalPromise }
}

export async function disconnectWallet(sessionKey: string): Promise<boolean> {
  const entry = sessions.get(sessionKey)
  if (!entry) return false

  clearTimeout(entry.idleTimer)

  try {
    await entry.client.disconnect({
      topic: entry.session.topic,
      reason: { code: 6000, message: 'Session ended by plugin' },
    })
  } catch {
    // Ignore disconnect errors
  }

  sessions.delete(sessionKey)
  return true
}

export function getConnectedWallet(sessionKey: string): WalletSession | undefined {
  const entry = sessions.get(sessionKey)
  if (entry) {
    resetIdleTimer(sessionKey)
  }
  return entry
}

export function isWalletConnected(sessionKey: string): boolean {
  return sessions.has(sessionKey)
}
