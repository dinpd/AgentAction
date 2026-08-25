# MCP Authorization Conformance Suite v2

This directory contains an experimental, non-normative conformance suite for
action-bound authorization of a state-changing MCP `tools/call`.

Run it from the repository root:

```bash
python scripts/run_mcp_authorization_conformance_v2.py \
  fixtures/mcp-authorization-conformance-v2/vector.json
```

The runner exits with status `0` only when every case matches its expected
portable failure codes and execution-closure behavior. It covers:

- RS256 JWS verification against an in-memory JWKS;
- trusted issuer, provider audience, algorithm, and key selection;
- exact MCP action and provider-owned field bindings;
- runtime identity, delegation attenuation, policy, approval, and risk state;
- unknown signing-key rejection;
- idempotent replay of a prior completed result; and
- partial-then-complete execution closure correlation.

The runner generates fresh RSA keys in memory. It never writes or prints a
private key, JWS, or operational credential. All fixture identifiers use
reserved `.test` domains or visibly synthetic values.

## Interpretation

Passing this suite means an implementation agrees with these AgentAction
experimental cases. It is not certification against an IETF, OpenID, W3C, or
MCP standard and does not make the AgentAction evidence fields standardized.

The partial-execution case demonstrates correlation semantics only. A real
provider must define whether a partial operation is retryable, compensatable,
or terminal and must enforce that decision atomically with its own idempotency
state.
