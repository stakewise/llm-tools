import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'

import { state, stopServer, ensureServerRunning } from './utils'


export default definePluginEntry({
  id: 'stakewise-llm-tools',
  name: 'StakeWise Staking',
  description: 'Starts a local StakeWise API server and adds a reset command plus skill',
  async register(api: OpenClawPluginApi, ctx?: { config?: { port?: number; host?: string } }) {
    state.port = ctx?.config?.port || 5165
    state.host = ctx?.config?.host || '127.0.0.1'

    await ensureServerRunning()

    api.registerCommand({
      name: 'stakewise_reset',
      description: 'Restart the local StakeWise API server.',
      handler: async () => {
        await stopServer()
        await ensureServerRunning()

        return {
          text: 'The stakewise server has been restarted',
        }
      },
    })
  },
})
