import { isAddress } from 'ethers'

import { ResponseFn } from '../../types'


const isValidVaultAddress = (url: URL, response: ResponseFn): string | false => {
  const vaultAddress = url.searchParams.get('vaultAddress')

  if (!vaultAddress || !isAddress(vaultAddress)) {
    response({
      code: 400,
      error: 'The vault address provided is invalid.',
    })

    return false
  }

  return vaultAddress
}


export default isValidVaultAddress
