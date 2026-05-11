import { getAddress, isAddress } from 'ethers'

import type { ResponseFn } from '../types'
import { state } from '../state'


const saveAddress = (url: URL, response: ResponseFn) => {
  const address = url.searchParams.get('address')

  if (isAddress(address)) {
    state.address = getAddress(address)

    response({
      address,
      result: `The ${state.address} address has been successfully saved`,
    })
  }
  else {
    response({
      code: 400,
      error: `
        You did not provide your wallet address, or it was provided in an incorrect format.
        Please provide a valid Ethereum address.
      `,
    })
  }
}


export default saveAddress
