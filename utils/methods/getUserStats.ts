import {
  date,
  getSDK,
  formatApy,
  parseDays,
  isValidUserAddress,
  isValidVaultAddress,
  formatNumberTokenValue,
} from './helpers'
import { state } from '../state'
import type { ResponseFn } from '../types'


const getUserStats = async (url: URL, response: ResponseFn) => {
  const isValid = isValidUserAddress(response)

  if (!isValid) {
    return
  }

  const vaultAddress = isValidVaultAddress(url, response)

  if (!vaultAddress) {
    return
  }

  const daysCount = parseDays(url.searchParams.get('days'))

  const sdk = getSDK()

  const stats = await sdk.vault.getUserStats({
    vaultAddress,
    daysCount,
    userAddress: state.address as string,
  })

  if (!stats.apy.length && !stats.balance.length && !stats.rewards.length) {
    response({
      result: `No statistics available for your address in the ${vaultAddress} vault`,
    })

    return
  }

  const { apy, balance, rewards } = stats

  const totalRewards = rewards.reduce((sum, day) => sum + day.value, 0)
  const avgApy = apy.length
    ? apy.reduce((sum, day) => sum + day.value, 0) / apy.length
    : 0

  const balanceStart = balance.length ? balance[0].value : 0
  const balanceEnd = balance.length ? balance[balance.length - 1].value : 0

  let result = `
    # Your statistics in the vault for the last ${daysCount} days

    ## Summary
    - Average APY: **${formatApy(avgApy)}**
    - Total rewards: **${formatNumberTokenValue(totalRewards)}** ETH
    - Balance start: **${formatNumberTokenValue(balanceStart)}** ETH
    - Balance end: **${formatNumberTokenValue(balanceEnd)}** ETH

    ## Daily breakdown
  `

  for (let i = 0; i < apy.length; i++) {
    const apyDay = apy[i]
    const balanceDay = balance[i]
    const rewardsDay = rewards[i]

    const formattedDate = date.unix(apyDay.time).utc().format('YYYY-MM-DD')

    result += `
    ### **${formattedDate}**
    - APY: ${formatApy(apyDay.value)}
    - Balance: ${balanceDay ? `${formatNumberTokenValue(balanceDay.value)} ETH` : '—'}
    - Rewards: ${rewardsDay ? `${formatNumberTokenValue(rewardsDay.value)} ETH` : '—'}`
  }

  response({
    data: {
      summary: {
        avgApy,
        totalRewards,
        balanceStart,
        balanceEnd,
        daysCount,
      },
      apy,
      balance,
      rewards,
    },
    format: 'markdown',
    result,
  })
}


export default getUserStats
