import { parseEther } from 'ethers'

import { getConnectedWallet, isWalletConnected } from '../services/walletConnect'
import { constants } from '../utils'
import type { Methods } from '../types'


const deposit: Methods.Deposit = async (params) => {
  try {
    const { amount, network = 'mainnet' } = params

    const sessionKey = 'default'

    if (!isWalletConnected(sessionKey)) {
      return {
        content: [{
          type: 'text',
          text: 'No wallet connected. Please connect your wallet first using the connect_wallet tool.',
        }],
        details: { status: 'not_connected' },
      }
    }

    const networkLower = network.toLowerCase()
    const isSupportedNetwork = Object.keys(constants.supportedNetworks).includes(networkLower)

    if (!isSupportedNetwork) {
      return {
        content: [{
          type: 'text',
          text: `The "${network}" network is not supported. Choose mainnet, gnosis, or hoodi.`,
        }],
        details: null,
      }
    }

    const wallet = getConnectedWallet(sessionKey)!
    const chainId = constants.supportedNetworks[networkLower as keyof typeof constants.supportedNetworks]
    const depositToken = constants.depositTokens[chainId]
    const amountWei = parseEther(amount)

    // TODO: Build and send the actual deposit transaction via WalletConnect
    // The transaction would call the StakeWise vault deposit method:
    //
    // const tx = {
    //   from: wallet.address,
    //   to: constants.vaultAddress,
    //   data: encodeFunctionData for vault.deposit(receiver, referrer)
    //   value: amountWei.toString(16),
    // }
    //
    // const txHash = await wallet.client.request({
    //   topic: wallet.session.topic,
    //   chainId: `eip155:${chainId}`,
    //   request: {
    //     method: 'eth_sendTransaction',
    //     params: [tx],
    //   },
    // })

    return {
      content: [{
        type: 'text',
        text: `Deposit request prepared:\n\n` +
              `Amount: ${amount} ${depositToken}\n` +
              `From: ${wallet.address}\n` +
              `To vault: ${constants.vaultAddress}\n` +
              `Network: ${networkLower}\n\n` +
              `Transaction sending is not yet implemented. Coming soon!`,
      }],
      details: {
        status: 'pending_implementation',
        amount,
        depositToken,
        from: wallet.address,
        vault: constants.vaultAddress,
        network: networkLower,
      },
    }

  } catch (error: any) {
    console.error('Error in deposit:', error)
    return {
      content: [{
        type: 'text',
        text: `Error preparing deposit: ${error.message}`,
      }],
      details: { error: error.message },
    }
  }
}

export default deposit
