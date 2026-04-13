import { isAddress } from 'ethers'

import { isValidUserAddress, getStakeByVault } from './helpers'
import type { ResponseFn } from '../types'
import { state } from '../state'


const getVaultBalance = async (url: URL, response: ResponseFn) => {
  const vaultAddress = url.searchParams.get('vaultAddress') || []

  const isValid = isValidUserAddress(response)

  if (!isValid) {
    return
  }

  if (!isAddress(vaultAddress)) {
    response({
      code: 400,
      error: 'The vault address provided is invalid.',
    })

    return
  }

  const vaultData = await getStakeByVault({
    userAddress: state.address as string,
    vaultAddress: vaultAddress as string,
  })

  response({
    data: vaultData,
    format: 'markdown',
    result: `
      # Your statistics in the ${state.address} vault
      ${getStakeByVault.formatStakeText(vaultAddress, vaultData)}
    `,
  })
}


export default getVaultBalance
