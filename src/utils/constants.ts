import { parseEther } from 'ethers'
import { Network } from '@stakewise/v3-sdk'


export const supportedNetworks = {
  'mainnet': Network.Mainnet,
  'gnosis': Network.Gnosis,
  'hoodi': Network.Hoodi,
}

export const rpcUrls = {
  [Network.Mainnet]: 'https://ethereum-rpc.publicnode.com',
  [Network.Gnosis]: 'https://rpc.gnosischain.com',
  [Network.Hoodi]: 'https://ethereum-hoodi-rpc.publicnode.com',
}

export const depositTokens = {
  [Network.Mainnet]: 'ETH',
  [Network.Gnosis]: 'GNO',
  [Network.Hoodi]: 'ETH',
}

export const vaultAddress = '0x15639E82d2072Fa510E5d2b5F0db361c823bCad3'

export const minimalAmount = parseEther('0.00001')
