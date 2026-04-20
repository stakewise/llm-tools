import http from 'node:http'

import { ensureServerRunning } from './utils/server'
import { state } from './utils/state'


const ProxyPort = 5006

const formatPayload = (payload: any): string => {
  const lines: string[] = []

  lines.push(`ok: ${payload.ok}`)

  if (payload.error) {
    lines.push(`error: ${payload.error}`)
  }

  if (typeof payload.result === 'string') {
    lines.push('')
    lines.push('--- result ---')
    lines.push(payload.result.replace(/\n[ \t]+/g, '\n').trim())
  }

  if (payload.data?.params) {
    lines.push('')
    lines.push('--- data.params ---')
    lines.push(JSON.stringify(payload.data.params, null, 2))
  }
  else if (payload.data) {
    lines.push('')
    lines.push('--- data ---')
    lines.push(JSON.stringify(payload.data, null, 2))
  }

  return lines.join('\n') + '\n'
}

const main = async () => {
  await ensureServerRunning()

  const proxy = http.createServer(async (req, res) => {
    const target = `http://${state.host}:${state.port}${req.url || '/'}`

    try {
      const upstream = await fetch(target, { method: req.method })
      const text = await upstream.text()

      let body = text
      try {
        body = formatPayload(JSON.parse(text))
      }
      catch {
        // not JSON, leave as-is
      }

      res.writeHead(upstream.status, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(body)
    }
    catch (err: any) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`Proxy error: ${err.message}\n`)
    }
  })

  proxy.listen(ProxyPort, state.host, () => {
    console.log(`\n[debug-server] upstream:  http://${state.host}:${state.port}`)
    console.log(`[debug-server] proxy:     http://${state.host}:${ProxyPort}`)
    console.log('\n[debug-server] available routes (curl the proxy):')
    console.log(`  curl http://${state.host}:${ProxyPort}/health`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/save-address?address=0x..."`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/vault-data?vaultAddress=0x..."`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/vault-stats?vaultAddress=0x...&days=30"`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/user-stats?vaultAddress=0x...&days=30"`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/vault-balance?vaultAddress=0x..."`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/vault-queue?vaultAddress=0x..."`)
    console.log(`  curl http://${state.host}:${ProxyPort}/staked-vaults`)
    console.log(`  curl http://${state.host}:${ProxyPort}/vaults-list`)
    console.log(`  curl http://${state.host}:${ProxyPort}/created-vaults`)
    console.log(`  curl "http://${state.host}:${ProxyPort}/vault-whitelist?vaultAddress=0x..."`)

    console.log('\nPress Ctrl+C to stop\n')
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
