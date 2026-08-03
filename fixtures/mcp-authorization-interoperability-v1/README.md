# MCP Authorization Interoperability Vector v1

This directory contains one experimental, non-normative interoperability
vector for an MCP `tools/call` that changes provider state.

It demonstrates the composition described in
[`../../docs/agentic-identity-standards-crosswalk.md`](../../docs/agentic-identity-standards-crosswalk.md):

```text
principal + agent application + runtime + delegation
  -> policy decision + approval
  -> action-bound signed evidence
  -> independent provider verification
  -> single-use execution closure
```

Run the vector from the repository root:

```bash
python scripts/run_mcp_authorization_vector.py \
  fixtures/mcp-authorization-interoperability-v1/vector.json
```

The command exits with status `0` only when all four cases match their expected
outcomes:

- a valid action produces a linked execution closure;
- changed MCP arguments fail the signed action-digest binding;
- a different provider audience rejects the evidence; and
- reuse of consumed evidence is rejected.

The runner derives a public deterministic HMAC fixture key from a fixed vector
label. It is test material, not a credential and not a production signing
profile. Production deployments should use asymmetric JWS/JWKS or another
explicitly profiled envelope with managed issuer trust and key rotation.

All identifiers use reserved `.test` domains or visibly synthetic values. The
fixture contains no operational credentials or personal data.
