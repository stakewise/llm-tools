import { isValidUserAddress, isValidVaultAddress, getStakeByVault, formatStakeText, shortenAddress } from './helpers'
import type { ResponseFn } from '../types'
import { state } from '../state'


const getVaultBalance = async (url: URL, response: ResponseFn) => {
  const isValid = isValidUserAddress(response)

  if (!isValid) {
    return
  }

  const vaultAddress = isValidVaultAddress(url, response)

  if (!vaultAddress) {
    return
  }

  const vaultData = await getStakeByVault({
    userAddress: state.address as string,
    vaultAddress,
  })

  response({
    data: vaultData,
    format: 'markdown',
    result: `
      # Your statistics in the ${shortenAddress(vaultAddress)} vault
      ${formatStakeText(vaultData)}
    `,
  })
}


export default getVaultBalance
