import { StakeWiseSDK, Network } from '@stakewise/v3-sdk'


const getSDK = () => {
  const sdk = new StakeWiseSDK({
    network: Network.Mainnet,
    endpoints: {
      web3: [
        'https://ethereum-rpc.publicnode.com',
        'https://1rpc.io/eth',
      ],
    },
  })

  return sdk
}


export default getSDK
