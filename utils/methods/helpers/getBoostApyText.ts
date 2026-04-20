import formatApy from './formatApy'


const getBoostApyText = (apy: string, boostApy: string) => {
  const data = {
    apy: Number(apy),
    boostApy: Number(boostApy),
  }

  if (data.boostApy <= 0 || data.apy >= data.boostApy) {
    return `APY: **${formatApy(data.apy)}**`
  }
  else {
    return `APY: **${formatApy(data.apy)} - ${formatApy(data.boostApy)}**`
  }
}


export default getBoostApyText
