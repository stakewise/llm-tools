import { ensureServerRunning } from './utils/server'
import { state } from './utils/state'


async function main() {
  await ensureServerRunning()

  console.log(`\n[debug-server] running on http://${state.host}:${state.port}`)
  console.log('[debug-server] available routes:')
  console.log('  GET /health')
  console.log('  GET /save-address?address=0x...')
  console.log('  GET /get-balance')
  console.log('  GET /get-staked-vaults')
  console.log('\nPress Ctrl+C to stop\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
