import { parseEther } from 'ethers'

import formatTokenValue from './formatTokenValue'


const formatNumberTokenValue = (value: number) => {
  const parts = String(value).split('.')

  if (parts[1] && parts[1].length > 18) {
    parts[1] = parts[1].slice(0, 18)
  }

  return formatTokenValue(parseEther(parts.join('.')))
}


export default formatNumberTokenValue
