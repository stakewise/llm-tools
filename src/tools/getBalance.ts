import { StakeWiseSDK } from '@stakewise/v3-sdk'
import { isAddress, formatEther } from 'ethers'

import { constants } from '../utils'
import { Methods } from '../types'




const getBalance: Methods.GetBalance = async (params) => {
  try {
    const { address = '' } = params
    const network = (params.network || '').toLowerCase()

    const isSupportedAddress = isAddress(address)
    const isSupportedNetwork = Object.keys(constants.supportedNetworks).includes(network)

    if (!isSupportedNetwork) {
      return {
        content: [{
          type: 'text',
          text: `The "${network}" network is not supported, you can choose either the mainnet or the gnosis network`,
        }],
        details: null,
      } 
    }

    if (!isSupportedAddress) {
      return {
        content: [{
          type: 'text',
          text: 'Invalid Ethereum address (checksum or format error)',
        }],
        details: null,
      } 
    }

    const chainId = constants.supportedNetworks[network as keyof typeof constants.supportedNetworks]

    const sdk = new StakeWiseSDK({
      network: chainId,
      endpoints: {
        web3: constants.rpcUrls[chainId],
      }
    })

    const { assets, totalEarnedAssets } = await sdk.vault.getStakeBalance({
      vaultAddress: constants.vaultAddress,
      userAddress: address,
    })

    const data = {
      stakedAssets: formatEther(assets),
      earnedAssets: formatEther(totalEarnedAssets),
      depositToken: constants.depositTokens[chainId],
      status: constants.minimalAmount < assets ? 'active' : 'inactive',
    }
    
    return {
      content: [{
        type: 'text',
        text: `Staking balance for ${address} (${network}):\n\n` +
              `• Total staked: ${data.stakedAssets} ${data.depositToken}\n` +
              `• Rewards: ${data.earnedAssets} ${data.depositToken}\n` +
              `• Status: ${data.status}\n`
      }],
      details: data
    }
    
  }
  catch (error: any) {
    console.error('Error in check_staking_balance:', error)

    return {
      content: [{
        type: 'text',
        text: `Error checking staking balance: ${error.message}`
      }],
      details: { error: error.message }
    }
  }
}


export default getBalance
