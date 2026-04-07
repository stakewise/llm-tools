---
name: stakewise-staking
description: Save a user's wallet address and get their Stakewise staking balance from the local Stakewise plugin server.
---

# Stakewise Staking Skill

Use this skill when the user:
- Provides a wallet address to save (e.g. "My address is 0x...", "Save address 0x...")
- Asks for a Stakewise balance, staking balance, or says things like:
  - "Show my Stakewise balance"
  - "Get my staking balance"
  - "Give me the staking balance for 0x..."

## Endpoints

- **Save address**: `http://127.0.0.1:5005/save-address?address=<ADDRESS>`
- **Get balance**: `http://127.0.0.1:5005/get-balance` (no parameters — uses the previously saved address)

## What to do

### When the user provides a wallet address (without asking for balance)

1. Extract the wallet address from the user request.
2. Save it by calling:
   `curl -sS "http://127.0.0.1:5005/save-address?address=<ADDRESS>"`
3. Confirm to the user that the address has been saved.

### When the user asks for their balance

1. **You must have the user's wallet address first.** If the user included an address in their request, use it. If not — ask the user for their Ethereum wallet address before proceeding.
2. **Step 1 — save the address.** Call:
   `curl -sS "http://127.0.0.1:5005/save-address?address=<ADDRESS>"`
   Verify the response has `"ok": true`. If not, relay the error to the user.
3. **Step 2 — get the balance.** Only after a successful save, call:
   `curl -sS "http://127.0.0.1:5005/get-balance"`
4. Parse the JSON response and return only the `result` field to the user unless they asked for technical details.

**Important:** Always call `/save-address` before `/get-balance`. The balance endpoint uses the address stored on the server, so it must be saved first.

## Error handling

- If the server is unavailable, say that the local Stakewise service is not running.
- If the response is malformed, say that the Stakewise service returned an unexpected response.
- If `/save-address` returns an error about an invalid address, ask the user to provide a valid Ethereum address.
- Do not invent balances.
