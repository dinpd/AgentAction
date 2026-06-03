# Signed Receipts Implementation Brief

## Goal

Add production-oriented signed receipt support while keeping the current HMAC
receipt path for local demos and CI fixtures.

The first production slice should support JWS/JWKS-style verification. DID URL
verification methods can come later once the receipt envelope and trust policy
are stable.

## Current State

AgentID currently supports:

- raw provider authorization receipts
- HMAC-signed provider receipt envelopes in the TypeScript adapter
- Python CLI receipt verification with `agentid provider verify-receipt`
- provider-side middleware for Express and FastAPI

The HMAC path is useful for local demos, but production providers need managed
keys, key rotation, issuer identity, key IDs, and replay protection.

## Proposed Receipt Envelope

```json
{
  "alg": "RS256",
  "kid": "https://enterprise.example.com/.well-known/jwks.json#agentid-2026-06",
  "issuer": "https://enterprise.example.com",
  "subject": "did:web:example.com:agents:support-refund-agent",
  "payload": {
    "decision_id": "dec_123",
    "tenant_id": "acme-corp",
    "agent_id": "support-refund-agent",
    "user_id": "support-rep-17",
    "tool": "provider.crm.update_customer",
    "action": "write",
    "resource": "provider/customer/cus_123",
    "case_id": "case-1042",
    "customer_id": "cus_123",
    "approval_id": "approval-456",
    "jit_grant_id": "grant_789",
    "expires_at": "2026-06-03T18:00:00Z"
  },
  "signature": "..."
}
```

For compatibility, the implementation can also accept compact JWS where the
claims are the receipt payload plus `iss`, `sub`, `aud`, `exp`, `iat`, and
`jti`.

## Verification Rules

The verifier should check:

- envelope shape is valid
- algorithm is allowed by policy
- issuer is trusted
- `kid` resolves to a valid public key
- signature verifies
- receipt is not expired
- optional audience matches the provider or MCP server
- receipt payload matches expected tenant, agent, tool, action, resource, job,
  case, customer, approval, JIT grant, and amount bindings
- single-use receipts have not been replayed

## Implementation Steps

1. Add a Python receipt signing/verification module for JWS-style envelopes.
2. Add TypeScript verification support in `mcp-gateway-adapter/src/receipts.ts`.
3. Add CLI flags:
   - `--jwks`
   - `--issuer`
   - `--audience`
   - `--allowed-alg`
4. Add provider contract fields:
   - `receipt.verification: signed_or_introspected`
   - `receipt.allowed_issuers`
   - `receipt.jwks_uri`
   - `receipt.audience`
5. Add replay-cache hooks for provider middleware.
6. Keep HMAC support documented as demo/local only.

## Tests

Add tests for:

- valid JWS receipt
- invalid signature
- unknown issuer
- unknown key ID
- expired receipt
- wrong audience
- resource mismatch
- replayed single-use receipt
- HMAC compatibility path remains unchanged

## Future DID/VC Step

After JWS/JWKS support lands, add DID URL verification:

```json
{
  "kid": "did:web:enterprise.example.com#agentid-receipt-key-2026-06"
}
```

The verifier would resolve the DID document, find the verification method, and
verify the signature against the referenced key. This should remain optional and
policy-controlled.
