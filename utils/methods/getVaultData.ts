import { isAddress } from 'ethers'

import type { ResponseFn } from '../types'
import { getSDK, formatTokenValue, formatApy } from './helpers'


const getVaultData = async (url: URL, response: ResponseFn) => {
  const vaultAddress = url.searchParams.get('vaultAddress') || []

  if (!isAddress(vaultAddress)) {
    response({
      code: 400,
      error: 'The vault address provided is invalid.',
    })

    return
  }

  const sdk = getSDK()

  const vault = await sdk.vault.getVault({ vaultAddress })

  const name = vault.displayName || vaultAddress
  const capacity = formatTokenValue(vault.capacity)
  const totalAssets = formatTokenValue(vault.totalAssets)

  const utilization = Number(vault.totalAssets) && Number(vault.capacity)
    ? ((Number(vault.totalAssets) / Number(vault.capacity)) * 100).toFixed(1)
    : null

  let result = `
    # ${name}
    ${vault.description ? `\n${vault.description}\n` : ''}
    ## Performance
    - APY: **${formatApy(vault.apy)}%**
    - Base APY: **${formatApy(vault.baseApy)}%**
    - Performance: **${vault.performance}%**
    - Fee: **${vault.feePercent}%**

    ## Capacity
    - Total assets: **${totalAssets}** ETH
    - Capacity: **${capacity}** ETH${utilization ? `\n    - Utilization: **${utilization}%**` : ''}

    ## Configuration
    - Version: ${vault.version}
    - Private: ${vault.isPrivate ? 'Yes' : 'No'}
    - ERC20 token: ${vault.isErc20 ? `Yes (${vault.tokenSymbol})` : 'No'}
    - Smoothing pool: ${vault.isSmoothingPool ? 'Yes' : 'No'}
  `

  if (vault.osTokenConfig) {
    result += `
    ## osETH minting
    - LTV: **${Number(vault.osTokenConfig.ltvPercent) / 1e16}%**
    `
  }

  response({
    data: vault,
    format: 'markdown',
    result,
  })
}


export default getVaultData
