import QRCode from 'qrcode'

import { createWalletConnectSession } from '../services/walletConnect'
import type { Methods } from '../types'


const APPROVAL_TIMEOUT_MS = 120_000

const connectWallet: Methods.ConnectWallet = async (_id, _params, signal, onUpdate) => {
  try {
    const sessionKey = 'default'

    const { uri, approval } = await createWalletConnectSession(sessionKey)

    // Generate QR code as base64 PNG
    const qrDataUrl = await QRCode.toDataURL(uri, {
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })

    // Extract base64 data from data URL (remove "data:image/png;base64," prefix)
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '')

    // Send QR code and link immediately via onUpdate
    if (onUpdate) {
      onUpdate({
        content: [
          {
            type: 'text',
            text: `Scan the QR code or use the link to connect your wallet:\n\n${uri}`,
          },
          {
            type: 'image',
            data: base64,
            mimeType: 'image/png',
          },
        ],
        details: { status: 'waiting_for_connection', uri },
      })
    }

    // Wait for user to approve the connection (with timeout)
    const result = await Promise.race([
      approval.then((res) => ({ status: 'connected' as const, ...res })),

      new Promise<{ status: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ status: 'timeout' }), APPROVAL_TIMEOUT_MS)
      ),

      // Respect abort signal
      ...(signal
        ? [
          new Promise<{ status: 'aborted' }>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('Aborted')),
              { once: true }
            )
          })
        ]
        : []
      ),
    ])

    if (result.status === 'timeout') {
      return {
        content: [{
          type: 'text',
          text: 'Connection timed out. The QR code is no longer valid. Please try again.',
        }],
        details: { status: 'timeout' },
      }
    }

    if (result.status === 'connected') {
      return {
        content: [{
          type: 'text',
          text: `Wallet connected successfully!\n\n` +
                `Address: ${result.address}\n` +
                `Chain ID: ${result.chainId}\n\n` +
                `The session will auto-disconnect after 10 minutes of inactivity.\n` +
                `Would you like to make a deposit?`,
        }],
        details: {
          status: 'connected',
          address: result.address,
          chainId: result.chainId,
        },
      }
    }

    return {
      content: [{ type: 'text', text: 'Connection was aborted.' }],
      details: { status: 'aborted' },
    }

  }
  catch (error: any) {
    console.error('Error in connectWallet:', error)

    return {
      content: [{
        type: 'text',
        text: `Error connecting wallet: ${error.message}`,
      }],
      details: { error: error.message },
    }
  }
}

export default connectWallet
