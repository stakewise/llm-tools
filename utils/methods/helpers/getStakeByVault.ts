import getSDK from './getSDK'
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
    userApy: Number(apy.toFixed(2)),
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

  let text = `
    - APY: ${userApy}
    - Stake: ${stakedAssets} ETH
  `

  if (mintedShares) {
    text += `
      - Minted: ${mintedShares} osETH
    `
  }

  if (boostedShares) {
    text += `
      - Boosted: ${boostedShares} osETH
    `
  }

  text += `
    - Total rewards: ${rewardsAssets} ETH
  `

  return text
}


export default getStakeByVault
