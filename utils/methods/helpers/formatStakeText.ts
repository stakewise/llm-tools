import { OsTokenPositionHealth } from '@stakewise/v3-sdk'

import formatTokenValue from './formatTokenValue'

import type getStakeByVault from './getStakeByVault'


type StakeData = Awaited<ReturnType<typeof getStakeByVault>>

const formatStakeText = (data: StakeData) => {
  const {
    userApy,
    stakedAssets,
    mintedShares,
    boostedShares,
    rewardsAssets,
    params: {
      health,
      maxWithdrawAssets,
      maxMintShares,
      sharesToBurn,
    },
  } = data

  let text = `- APY: **${userApy}** %\n`

  text += `- Stake: **${stakedAssets}** ETH\n`
  text += `- Max mintable osETH: **${formatTokenValue(maxMintShares)}** osETH\n\n`

  if (mintedShares) {
    text += `- Minted: **${mintedShares}** osETH\n`
    text += `Max withdraw assets: **${formatTokenValue(maxWithdrawAssets)}**`
    text += `osETH to burn for full unstake: **${formatTokenValue(sharesToBurn)}** osETH`

    switch (health) {
      case OsTokenPositionHealth.Healthy:
        text += `- Position health: **Healthy**\n`
        break

      case OsTokenPositionHealth.Moderate:
        text += `- Position health: **Moderate**\n`
        break

      case OsTokenPositionHealth.Risky:
        text += `- Position health: **Risky**\n`
        break

      case OsTokenPositionHealth.Unhealthy:
        text += `- Position health: **Unhealthy**\n\n`
        break

      default:
        break
    }
  }

  if (boostedShares) {
    text += `- Boosted: **${boostedShares}** osETH\n`
  }

  text += `- Total rewards: **${rewardsAssets}** ETH\n\n`

  return text
}


export default formatStakeText
