import { isAddress } from 'ethers'

import {
  date,
  getSDK,
  formatApy,
  formatNumberTokenValue,
} from './helpers'
import type { ResponseFn } from '../types'


const defaultDays = 30
const maxDays = 365

const getVaultStats = async (url: URL, response: ResponseFn) => {
  const vaultAddress = url.searchParams.get('vaultAddress') || []
  const daysParam = url.searchParams.get('days')

  if (!isAddress(vaultAddress)) {
    response({
      code: 400,
      error: 'The vault address provided is invalid.',
    })

    return
  }

  const daysCount = Math.min(
    Math.max(Number(daysParam) || defaultDays, 1),
    maxDays
  )

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
