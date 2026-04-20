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
    { liqThresholdPercent },
    maxMintShares,
    maxWithdrawAssets,
    sharesToBurn,
  ] = await Promise.all([
    sdk.boost.getData(values),
    sdk.vault.getUserApy(values),
    sdk.osToken.getBalance(values),
    sdk.vault.getStakeBalance(values),
    sdk.vault.getOsTokenConfig(values),
    sdk.osToken.getMaxMintAmount(values),
    sdk.vault.getMaxWithdrawAmount(values),
    sdk.osToken.getBurnAmountForUnstake(values),
  ])

  const { health } = await sdk.osToken.getHealthFactor({
    ...values,
    stakedAssets: stake.assets,
    mintedAssets: osToken.assets,
    liqThresholdPercent: BigInt(liqThresholdPercent),
  })

  const params: any = {
    maxWithdrawAssets,
    stakedAssets: stake.assets,
    rewardsAssets: stake.totalEarnedAssets,
  }

  if (params.stakedAssets) {
    params.maxMintShares = maxMintShares
  }

  if (osToken.shares) {
    params.health = health
    params.sharesToBurn = sharesToBurn
    params.mintedShares = osToken.shares
  }

  if (boost.shares) {
    params.boostedShares = boost.shares
  }

  return {
    params: {
      health,
      sharesToBurn,
      maxMintShares,
      maxWithdrawAssets,
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


export default getStakeByVault
