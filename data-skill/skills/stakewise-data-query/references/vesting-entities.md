# Vesting entities

The single entity that tracks vesting escrow positions for users. The subgraph stores only escrow identity; amounts and the schedule live on-chain on each escrow's proxy contract.

### VestingEscrow

**Description.** One row per vesting escrow proxy contract for a user. Use to answer "do I have any vesting positions?", "which escrow contracts are mine?", "what token is being vested?".

**Query example.**

```graphql
{
  vestingEscrows(where: { recipient: "0xUSER" }) {
    id
    token
    recipient
  }
}
```

**Arguments.**

- `where.recipient` — beneficiary wallet address (lowercase). The most common filter.
- `where.token` — restrict to a specific vested token (e.g. SWISE).

**Modification.** Created when the protocol grants a vesting position. Claiming happens via the escrow contract's `claim(...)` call — defer to the SDK or `app.stakewise.io`.

**Response fields.**

- `id: ID!` — escrow proxy contract address (lowercase).
- `token: String!` — the ERC20 token contract address being vested (lowercase hex; the field type is `String` for legacy reasons, but the value is an address — e.g. `"0x48c3399719b582dd63eb5aadf12a40b4c3f52fa2"` for SWISE on Mainnet).
- `recipient: Bytes!` — beneficiary wallet address (lowercase).

**What the subgraph does NOT tell you.** To get the **amount currently claimable**, the start/end of the vesting window, or whether the escrow is paused, you must call the escrow contract on-chain (each escrow is an EIP-1167 proxy of a shared implementation). The skill no longer ships an RPC fallback — so for amount/schedule questions, point the user to `app.stakewise.io` (the vesting page renders these from the same on-chain calls) and surface the escrow contract address from this entity so they know what to look at.

Do not estimate claimable yourself with `total × (now − start) / (end − start) − claimed` — that formula diverges from the contract when cliff or pause logic is involved.
