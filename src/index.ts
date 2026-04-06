import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import { Type } from '@sinclair/typebox'

import { constants } from './utils'
import { getBalance } from './tools'


export default definePluginEntry({
  id: 'stakewise-staking-plugin',
  name: 'StakeWise Tools',
  description: 'A toolkit for managing liquidity pools based on the StakeWise protocol',

  register(api: OpenClawPluginApi) {
    api.registerTool({
      name: 'stakewise_getBalance',
      label: 'StakeWise — Get staking balance',
      description: 'Queries live on-chain StakeWise staking data for a given Ethereum address. Returns staked assets, earned rewards, deposit token, and status. Use this tool for any StakeWise balance or staking rewards request instead of web search.',
      parameters: Type.Object({
        address: Type.String({
          description: 'Ethereum wallet address starting with 0x (42 characters total, e.g. 0xEC01cB780202595Ce2Fb11225aABfAd201B54e0f)',
          pattern: '^0x[a-fA-F0-9]{40}$'
        }),
        network: Type.Optional(Type.String({
          description: 'Blockchain network: mainnet (default), gnosis, or hoodi',
          enum: Object.keys(constants.supportedNetworks),
        }))
      }),
      async execute(_id: string, params: Parameters<typeof getBalance>[0]) {
        return getBalance(params)
      }
    }),

    console.log('Staking Balance plugin tool registered successfully')
  }
})
