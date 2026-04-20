import {
  date,
  getSDK,
  formatApy,
  parseDays,
  isValidVaultAddress,
  formatNumberTokenValue,
} from './helpers'
import type { ResponseFn } from '../types'


const getVaultStats = async (url: URL, response: ResponseFn) => {
  const vaultAddress = isValidVaultAddress(url, response)

  if (!vaultAddress) {
    return
  }

  const daysCount = parseDays(url.searchParams.get('days'))

  const sdk = getSDK()

  const stats = await sdk.vault.getVaultStats({
    vaultAddress,
    daysCount,
  })

  if (!stats.length) {
    response({
      result: `No statistics available for the ${vaultAddress} vault`,
    })

    return
  }

  const first = stats[stats.length - 1]
  const last = stats[0]

  const totalRewards = stats.reduce((sum, day) => sum + day.rewards, 0)
  const avgApy = stats.reduce((sum, day) => sum + day.apy, 0) / stats.length

  let result = `
    # Vault statistics for the last ${daysCount} days

    ## Summary
    - Average APY: **${formatApy(avgApy)}**
    - Total rewards: **${formatNumberTokenValue(totalRewards)}** ETH
    - TVL start: **${formatNumberTokenValue(first.balance)}** ETH
    - TVL end: **${formatNumberTokenValue(last.balance)}** ETH

    ## Daily breakdown
  `

  for (const day of stats) {
    const formattedDate = date.unix(day.time).utc().format('YYYY-MM-DD')

    result += `
    ### **${formattedDate}**
    - APY: ${formatApy(day.apy)}
    - TVL: ${formatNumberTokenValue(day.balance)} ETH
    - Rewards: ${formatNumberTokenValue(day.rewards)} ETH`
  }

  response({
    data: {
      summary: {
        avgApy,
        totalRewards,
        tvlStart: first.balance,
        tvlEnd: last.balance,
        daysCount,
      },
      stats,
    },
    format: 'markdown',
    result,
  })
}


export default getVaultStats
