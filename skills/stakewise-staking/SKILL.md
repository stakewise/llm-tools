---
name: stakewise-staking
description: Connect a user's wallet via WalletConnect QR code or manual address, and get their Stakewise staking balance.
---

# Stakewise Staking Skill

Use this skill when the user:
- Wants to connect their wallet (e.g. "Connect my wallet", "Link wallet")
- Provides a wallet address to save (e.g. "My address is 0x...", "Save address 0x...")
- Asks for a Stakewise balance, staking balance, or says things like:
  - "Show my Stakewise balance"
  - "Get my staking balance"
  - "Give me the staking balance for 0x..."

## Endpoints

| Endpoint | Description |
|---|---|
| `GET http://127.0.0.1:5005/connect` | Start WalletConnect session, returns QR code and URI |
| `GET http://127.0.0.1:5005/connect-status` | Check if the wallet has been connected |
| `GET http://127.0.0.1:5005/save-address?address=<ADDRESS>` | Manually save a wallet address |
| `GET http://127.0.0.1:5005/get-balance` | Get staking balance (uses previously saved address) |

## Connecting a wallet (preferred method)

Use this flow when the user wants to connect their wallet or when you need their address and they haven't provided one.

1. Call: `curl -sS "http://127.0.0.1:5005/connect"`
2. The response contains:
   - `qrBase64` — a base64-encoded data URI of the QR code image (PNG). **Send this image to the user** so they can scan it with their mobile wallet. To display the image, use the base64 data URI directly — it is a complete `data:image/png;base64,...` string.
   - `uri` — a WalletConnect URI (`wc:...`). Send this as a clickable link for mobile users who can tap to open their wallet app directly.
3. Tell the user to scan the QR code or tap the link, then approve the connection in their wallet app.
4. Poll `curl -sS "http://127.0.0.1:5005/connect-status"` every few seconds to check the connection status:
   - `"connected": true` — the wallet is connected, the `address` field contains the user's address. Inform the user.
   - `"pending": true` — still waiting, continue polling.
   - `"pending": false, "connected": false` — the connection request expired or was rejected. Inform the user and suggest trying again.
5. The connection will automatically expire after 5 minutes if the user does not approve it.

## Saving an address manually (fallback)

If the user provides their address directly (e.g. "My address is 0x..."), save it without WalletConnect:

1. Extract the wallet address from the user request.
2. Call: `curl -sS "http://127.0.0.1:5005/save-address?address=<ADDRESS>"`
3. Confirm to the user that the address has been saved.

## Getting the balance

1. **You must have the user's wallet address first.** If neither `/connect` nor `/save-address` has been called yet:
   - Offer to connect via QR code (preferred), or
   - Ask the user for their Ethereum wallet address.
2. If the user provided an address in their message, call `/save-address?address=<ADDRESS>` first.
3. Call: `curl -sS "http://127.0.0.1:5005/get-balance"`
4. Return only the `result` field to the user unless they asked for technical details.

## Error handling

- If the server is unavailable, say that the local Stakewise service is not running.
- If the response is malformed, say that the Stakewise service returned an unexpected response.
- If `/save-address` returns an error about an invalid address, ask the user to provide a valid Ethereum address.
- If `/connect` returns a 409, a connection is already pending — check `/connect-status` instead.
- Do not invent balances.
