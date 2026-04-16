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
    maxWithdrawAssets,
  ] = await Promise.all([
    sdk.boost.getData(values),
    sdk.vault.getUserApy(values),
    sdk.osToken.getBalance(values),
    sdk.vault.getStakeBalance(values),
    sdk.vault.getOsTokenConfig(values),
    sdk.vault.getMaxWithdrawAmount(values),
  ])

  const { health } = await sdk.osToken.getHealthFactor({
    ...values,
    stakedAssets: stake.assets,
    mintedAssets: osToken.assets,
    liqThresholdPercent: BigInt(liqThresholdPercent),
  })

  return {
    params: {
      health,
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
