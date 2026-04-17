import {
  shortenAddress,
  getBoostApyText,
  getStakeByVault,
  fetchSubgraph,
  formatStakeText,
  formatTokenValue,
  isValidUserAddress,
} from './helpers'
import { state } from '../state'
import type { ResponseFn } from '../types'


type Vault = {
  apy: string
  address: string
  totalAssets: string
  displayName: string
  maxBoostApy: string
}

const getVaultsWithStake = async (_: URL, response: ResponseFn) => {
  const isValid = isValidUserAddress(response)

  if (!isValid) {
    return
  }

  let data: { vaults: Vault[] }

  try {
    data = await fetchSubgraph<{ vaults: Vault[] }>(`{
      vaults(
        skip: 0
        first: 1000
        where: {
          and: [
            {
              or: [
                { allocators_: { address: "${state.address}" } }
                { exitRequests_: { owner: "${state.address}" } }
                { leveragePositions_: { user: "${state.address}" } }
              ]
            }
          ]
        }
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
  }
  catch (err: any) {
    response({ code: 400, error: err.message })
    return
  }

  if (!data.vaults.length) {
    response({
      data: [],
      result: 'User has no deposits in vaults',
    })

    return
  }

  let vaults = '',
      totalStaked = 0n,
      totalMinted = 0n,
      totalBossted = 0n,
      totalRewards = 0n

  type VaultData = typeof data.vaults[number] & {
    userStats: Awaited<ReturnType<typeof getStakeByVault>>
  }

  const vaultsData: VaultData[] = []

  for (let i = 0; i < data.vaults.length; i++) {
    const { displayName, address, totalAssets, apy, maxBoostApy } = data.vaults[i]

    const vaultData = await getStakeByVault({
      userAddress: state.address as string,
      vaultAddress: address,
    })

    totalStaked += vaultData.params.stakedAssets
    totalMinted += vaultData.params.mintedShares
    totalBossted += vaultData.params.boostedShares
    totalRewards += vaultData.params.rewardsAssets

    vaultsData.push({
      apy,
      address,
      displayName,
      totalAssets,
      maxBoostApy,
      userStats: vaultData,
    })

    vaults += `
      ## Vault: ${displayName || shortenAddress(address)}
      - Address: **${address}**
      - Vault TVL: **${formatTokenValue(totalAssets)}** ETH
      - Vault ${getBoostApyText(apy, maxBoostApy)}

      Your statistics in this vault:
      ${formatStakeText(vaultData)}
      ---
    `
  }

  let result = `# The **${shortenAddress(state.address)}** address interacted with the following vaults\n`

  if (data.vaults.length > 1) {
    result += `- Total staked: **${formatTokenValue(totalStaked)}** ETH\n`

    if (totalMinted) {
      result += `- Total minted: **${formatTokenValue(totalMinted)}** osETH\n`
    }

    if (totalBossted) {
      result += `- Total boosted: **${formatTokenValue(totalBossted)}** osETH\n`
    }

    result += `- Total rewards: **${formatTokenValue(totalRewards)}** ETH\n`
  }

  result += `

    ${vaults}
  `

  response({
    result,
    data: vaultsData,
    format: 'markdown',
  })
}


export default getVaultsWithStake
