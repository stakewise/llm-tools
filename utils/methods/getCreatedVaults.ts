import { getAddress } from 'ethers'

import { isValidUserAddress } from './helpers'
import type { ResponseFn } from '../types'
import { state } from '../state'


const getCreatedVaults = async (_: URL, response: ResponseFn) => {
  const isValid = isValidUserAddress(response)

  if (!isValid) {
    return
  }

  const query = `{
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
  }`

  const responseData = await fetch('https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!responseData.ok) {
    response({ code: 400, error: `Subgraph request failed: ${responseData.status} ${responseData.statusText}` })
    return
  }

  const { data } = await responseData.json() as { data: { vaults: Array<{ address: string }> } }

  if (!data.vaults.length) {
    response({ code: 404, error: 'User has no created vaults' })
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
