import { getBoostApyText, shortenAddress, formatTokenValue, fetchSubgraph } from './helpers'
import type { ResponseFn } from '../types'


type Vault = {
  apy: string
  address: string
  totalAssets: string
  displayName: string
  maxBoostApy: string
}

const limit = 1000
const cacheTtl = 60 * 60 * 1000 // 1 hour

let cachedVaults: Vault[] | null = null
let cachedAt = 0

const fetchAllVaults = async (): Promise<Vault[]> => {
  if (cachedVaults && Date.now() - cachedAt < cacheTtl) {
    return cachedVaults
  }

  const allVaults: Vault[] = []
  let skip = 0

  while (true) {
    const data = await fetchSubgraph<{ vaults: Vault[] }>(`{
      vaults(
        skip: ${skip}
        first: ${limit}
        orderBy: apy
        orderDirection: desc
      ) {
        apy
        totalAssets
        displayName
        address: id
        maxBoostApy: allocatorMaxBoostApy
      }
    }`)

    allVaults.push(...data.vaults)

    if (data.vaults.length < limit) {
      break
    }

    skip += limit
  }

  cachedVaults = allVaults
  cachedAt = Date.now()

  return allVaults
}

const getVaultsList = async (_: URL, response: ResponseFn) => {
  let allVaults: Vault[]

  try {
    allVaults = await fetchAllVaults()
  }
  catch (err: any) {
    response({ code: 400, error: err.message })
    return
  }

  if (!allVaults.length) {
    response({
      data: [],
      result: 'No vaults found',
    })

    return
  }

  let vaults = ''

  for (const { displayName, address, totalAssets, apy, maxBoostApy } of allVaults) {
    vaults += `
      ## ${displayName || shortenAddress(address)}
      - Address: **${address}**
      - TVL: **${formatTokenValue(totalAssets)}** ETH
      - ${getBoostApyText(apy, maxBoostApy)}

    `
  }

  const result = `# All StakeWise vaults (${allVaults.length} total, sorted by APY)\n\n${vaults}`

  response({
    result,
    data: allVaults,
    format: 'markdown',
  })
}


export default getVaultsList
