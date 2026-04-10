import { isAddress } from 'ethers'

import { date, isValidAddress, getSDK, formatTokenValue } from './helpers'
import type { ResponseFn } from '../types'
import { state } from '../state'


const getQueueTime = (duration: number | null) => {
  let result = ''

  if (duration === null) {
    result += `
      - Exit time will appear within 24h
    `
  }

  const estimatedTime = '~24 hours'

  if (duration && duration > 0) {
    const now = date()
    const timeThen = date.unix(duration || 0)
    const difference = date.duration(timeThen.diff(now))
    const daysLeft = Math.floor(difference.asDays())

    const days = `${daysLeft} days`
    const timeLeft = daysLeft > 0 ? days : estimatedTime

    result += `
      - Estimated time: ${timeLeft}
    `
  }

  if (duration === 0) {
    result += `
      - Estimated time: ${estimatedTime}
    `
  }

  return result
}

const getVaultQueue = async (url: URL, response: ResponseFn) => {
  const vaultAddress = url.searchParams.get('address') || []

  const isValid = isValidAddress(response)

  if (!isValid) {
    return
  }

  if (!isAddress(vaultAddress)) {
    response({
      code: 400,
      error: 'The vault address provided is invalid.',
    })

    return
  }

  const sdk = getSDK()

  const values = {
    userAddress: state.address as string,
    vaultAddress,
  }

  const [ unboostQueue, unstakeQueue ] = await Promise.all([
    sdk.boost.getQueuePosition(values),
    sdk.vault.getExitQueuePositions(values),
  ])

  const {
    position,
    isClaimable,
    exitingShares,
    exitingAssets,
  } = unboostQueue

  const {
    total,
    requests,
    withdrawable,
  } = unstakeQueue

  const isUnstakeQueueExist = Boolean(total)
  const isUnboostQueueExist = Boolean(position)

  if (!isUnstakeQueueExist && !isUnboostQueueExist) {
    response({
      result: `No withdrawal queues were found in the ${vaultAddress} vault`,
    })

    return
  }

  let result = `
    # Queues for withdrawing funds from the ${vaultAddress} vault:
  `

  if (isUnstakeQueueExist) {
    result += `

      ## Unstake queue
      - Requests count: ${requests.length}
      - Total: ${formatTokenValue(total)} ETH
      - Withdrawable: ${formatTokenValue(withdrawable)} ETH
    `

    if (total !== withdrawable) {
      const time = getQueueTime(unstakeQueue.duration)

      if (time) {
        result += `
          ${time}
        `
      }
    }
  }

  if (isUnboostQueueExist) {
    result += `

      ## Unboost queue
      - Exiting boost: ${formatTokenValue(exitingShares)} osETH
      - Exiting rewards: ${formatTokenValue(exitingAssets)} ETH
    `

    if (isClaimable) {
      const time = getQueueTime(unstakeQueue.duration)

      if (time) {
        result += `
          ${time}
        `
      }
    }
  }

  response({
    data: {
      unboostQueue: {
        exitingShares,
        exitingAssets,
        duration: unboostQueue.duration,
      },
      unstakeQueue: {
        total,
        withdrawable,
        duration: unstakeQueue.duration,
      },
    },
    format: 'markdown',
    result,
  })
}


export default getVaultQueue
