import { getAddress } from 'ethers'

import { isValidUserAddress, fetchSubgraph } from './helpers'
import type { ResponseFn } from '../types'
import { state } from '../state'


const getCreatedVaults = async (_: URL, response: ResponseFn) => {
  const isValid = isValidUserAddress(response)

  if (!isValid) {
    return
  }

  let data: { vaults: Array<{ address: string }> }

  try {
    data = await fetchSubgraph<{ vaults: Array<{ address: string }> }>(`{
      vaults(
        skip: 0
        first: 1000
        where: {
          admin: "${state.address}"
        }
        orderBy: apy
        orderDirection: desc
      ) {
        address: id
      }
    }`)
  }
  catch (err: any) {
    response({ code: 400, error: err.message })
    return
  }

  if (!data.vaults.length) {
    response({
      data: [],
      result: 'User has no created vaults',
    })

    return
  }

  const addresses: string[] = []

  data.vaults.forEach(({ address }) => addresses.push(getAddress(address)))

  response({
    data: addresses,
    format: 'markdown',
    result: `
      # List of addresses for the vaults you have created
      ${addresses.join('\n')}
    `,
  })
}


export default getCreatedVaults
