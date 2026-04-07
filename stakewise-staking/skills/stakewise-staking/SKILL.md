---
name: stakewise-staking
description: Get a user's Stakewise balance from the local Stakewise plugin server.
---

# Stakewise Staking Skill

Use this skill when the user asks for a Stakewise balance, staking balance, or says things like:
- "Give me the staking balance for this address 0x..."
- "Show my Stakewise balance"
- "Get balance for address 0x..."

## What to do

1. Extract the wallet address from the user request.
2. Call the local Stakewise server on `http://127.0.0.1:5005/api/get-balance`.
3. Use `exec` with `curl` to query the endpoint. Pass the address as query parameter `address`, for example:
   `curl -sS "http://127.0.0.1:5005/api/get-balance?address=<ADDRESS>"`
4. Parse the JSON response.
5. Return only the `result` field to the user unless they asked for technical details.

## Error handling

- If the server is unavailable, say that the local Stakewise service is not running.
- If the response is malformed, say that the Stakewise service returned an unexpected response.
- Do not invent balances.
