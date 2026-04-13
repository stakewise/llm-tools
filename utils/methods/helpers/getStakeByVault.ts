import getSDK from './getSDK'
import formatApy from './formatApy'
import formatTokenValue from './formatTokenValue'


type Input = {
  userAddress: string
  vaultAddress: string
}

const getStakeByVault = async (values: Input) => {
  const sdk = getSDK()

  const [
    boost,
    apy,
    osToken,
    stake,
  ] = await Promise.all([
    sdk.boost.getData(values),
    sdk.vault.getUserApy(values),
    sdk.osToken.getBalance(values),
    sdk.vault.getStakeBalance(values),
  ])

  return {
    params: {
      stakedAssets: stake.assets,
      boostedShares: boost.shares,
      mintedShares: osToken.shares,
      rewardsAssets: stake.totalEarnedAssets,
    },
    userApy: formatApy(apy),
    stakedAssets: formatTokenValue(stake.assets),
    boostedShares: formatTokenValue(boost.shares),
    mintedShares: formatTokenValue(osToken.shares),
    rewardsAssets: formatTokenValue(stake.totalEarnedAssets),
  }
}

getStakeByVault.formatStakeText = (vaultAddress: string, data: Awaited<ReturnType<typeof getStakeByVault>>) => {
  const {
    userApy,
    stakedAssets,
    mintedShares,
    boostedShares,
    rewardsAssets,
  } = data

  let text = `- APY: **${userApy}** %\n`

  text += `- Stake: **${stakedAssets}** ETH\n`

  if (mintedShares) {
    text += `- Minted: **${mintedShares}** osETH\n`
  }

  if (boostedShares) {
    text += `- Boosted: **${boostedShares}** osETH\n`
  }

  text += `- Total rewards: **${rewardsAssets}** ETH\n`

  return text
}


export default getStakeByVault
