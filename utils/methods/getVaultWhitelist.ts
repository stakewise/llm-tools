import { getSDK, isValidVaultAddress, shortenAddress } from './helpers'
import type { ResponseFn } from '../types'
import { state } from '../state'


const getVaultWhitelist = async (url: URL, response: ResponseFn) => {
  const vaultAddress = isValidVaultAddress(url, response)

  if (!vaultAddress) {
    return
  }

  const sdk = getSDK()

  const { whitelist } = await sdk.vault.getWhitelist({ vaultAddress })

  if (!whitelist.length) {
    response({
      data: [],
      result: `The vault ${shortenAddress(vaultAddress)} has no whitelist entries`,
    })

    return
  }

  const isUserWhitelisted = state.address
    ? whitelist.some(({ address }) => address.toLowerCase() === state.address!.toLowerCase())
    : null

  let result = `# Whitelist for vault ${shortenAddress(vaultAddress)}\n`
  result += `- Total addresses: **${whitelist.length}**\n`

  if (isUserWhitelisted !== null) {
    result += `- Your address (${shortenAddress(state.address)}): **${isUserWhitelisted ? 'whitelisted' : 'not whitelisted'}**\n`
  }

  result += `\n## Addresses\n`

  for (const addr of whitelist) {
    result += `- ${addr}\n`
  }

  response({
    data: {
      whitelist,
      isUserWhitelisted,
    },
    format: 'markdown',
    result,
  })
}


export default getVaultWhitelist
