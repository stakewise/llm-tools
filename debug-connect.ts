import { SignClient } from '@walletconnect/sign-client'
import { StakeWiseSDK, Network } from '@stakewise/v3-sdk'
import { getAddress, isAddress } from 'ethers'
import QRCode from 'qrcode'


const WC_PROJECT_ID = 'f8110120a5a7b0ac720b64660b48cab7'

const WC_METADATA = {
  url: 'http://127.0.0.1:5005',
  name: 'StakeWise Openclaw Staking Plugin',
  description: 'Stake ETH through StakeWise protocol',
  icons: ['https://stakewise.io/logo512.png'],
}

const WC_OPTIONAL_NAMESPACES = {
  eip155: {
    methods: ['eth_sendTransaction', 'personal_sign'],
    events: ['accountsChanged', 'chainChanged'],
    chains: ['eip155:1'],
  },
}

async function main() {
  console.log('Initializing SignClient...')
  const client = await SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: WC_METADATA,
  })
  console.log('SignClient initialized')

  console.log('Creating connect request...')
  const { uri, approval } = await client.connect({
    requiredNamespaces: WC_OPTIONAL_NAMESPACES,
  })

  if (!uri) {
    console.error('ERROR: No URI returned')
    process.exit(1)
  }

  // Print QR to terminal
  const qrTerminal = await QRCode.toString(uri, { type: 'terminal', small: true })
  console.log('\n=== Scan this QR code ===')
  console.log(qrTerminal)

  console.log('=== Or open this link in your mobile wallet ===')
  console.log(uri)

  console.log('\nWaiting for wallet approval (5 min timeout)...')

  const timeout = setTimeout(() => {
    console.error('\nTimeout: no approval received in 5 minutes')
    process.exit(1)
  }, 5 * 60 * 1000)

  try {
    const session = await approval()
    clearTimeout(timeout)

    console.log('\n=== Session approved! ===')
    console.log('Topic:', session.topic)
    console.log('Namespaces:', JSON.stringify(session.namespaces, null, 2))

    const account = session.namespaces.eip155?.accounts?.[0]

    if (!account) {
      console.log('No accounts in session')
      process.exit(1)
    }

    const rawAddress = account.split(':')[2]
    const address = isAddress(rawAddress) ? getAddress(rawAddress) : rawAddress
    console.log('Address:', address)

    // --- Mock transaction ---
    console.log('\n=== Sending mock transaction ===')

    const sdk = new StakeWiseSDK({
      network: Network.Mainnet,
      endpoints: {
        web3: 'https://ethereum-rpc.publicnode.com',
      }
    })

    const tx: any = await sdk.vault.deposit.encode({
      userAddress: address,
      vaultAddress: '0x15639E82d2072Fa510E5d2b5F0db361c823bCad3',
      assets: 100000000000000n,
    })

    console.log('TX:', tx)

    if (typeof tx.value === 'bigint') {
      tx.value = String(tx.value)
    }

    const result = await client.request({
      topic: session.topic,
      chainId: 'eip155:1',
      request: {
        method: 'eth_sendTransaction',
        params: [tx],
      },
    })

    console.log('\n=== Transaction result ===')
    console.log('TX hash:', result)
  }
  catch (err) {
    clearTimeout(timeout)
    console.error('\nError:', err)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
