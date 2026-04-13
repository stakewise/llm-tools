import { isAddress } from 'ethers'

import { state } from '../../state'
import { ResponseFn } from '../../types'


const isValidUserAddress = (response: ResponseFn) => {
  if (!isAddress(state.address)) {
    response({
      code: 400,
      error: `
        Address not found.
        Enter the command "Set wallet address for the Stakewise plugin" to save the address.
      `,
    })

    return false
  }

  return true
}


export default isValidUserAddress
