# AgentPass Receipt Profiles

Receipt profiles describe how a scoped authorization receipt should be
interpreted. They keep discovery metadata generic while allowing a provider,
enterprise, or domain group to define precise outcome semantics.

AgentPass uses profiles for provider-side MCP authorization receipts. A provider
contract can advertise a profile in `provider_agentid.receipt.profile`:

```yaml
receipt:
  verification: jws_jwks
  transport: params.arguments._agentid_receipt
  profile:
    uri: https://agentid.dev/profiles/scoped-tool-receipt/v1
    canonicalization: agentid_canonical_json_v1
    digest_algorithm: SHA-256
    default_bindings:
      - tenant_id
      - agent_id
      - user_id
      - tool
      - action
      - resource
      - job_id
    outcomes:
      - value: ALLOW
        description: The action is authorized under the profile and may continue to provider business checks.
      - value: REFER
        description: The action needs an external review, approval, or business decision before execution.
      - value: DENY
        description: The action is not authorized under the profile and must not execute.
    basis:
      handling: categorical_or_reference
      category_field: basis_category
      reference_field: basis_ref
```

The profile URI identifies the rules. AgentPass examples use `ALLOW`, `REFER`,
and `DENY`, but the schema does not hard-code those as the only valid outcomes.
Payment, support, healthcare, infrastructure, or compliance profiles can define
closed vocabularies that fit their own verifier rules.

## Canonicalization

`agentid_canonical_json_v1` is the default AgentPass canonicalization rule for
receipt-bound fields:

1. Build a JSON object containing only the fields named by the profile and the
   tool's `authorization_requirements.bind_receipt_to`.
2. Omit fields whose value is absent. Do not substitute empty strings or nulls
   unless the profile explicitly requires them.
3. Keep JSON scalar values in their native type. For example, booleans stay
   booleans and numeric amounts stay numbers.
4. Sort object keys lexicographically by Unicode code point.
5. Serialize without insignificant whitespace, using UTF-8.
6. Hash the resulting bytes with the profile's `digest_algorithm`.

The resulting digest should be included in the signed receipt when the verifier
needs request-body or argument-digest binding. The provider should recompute the
digest from the actual request before the mutating handler runs.

## Binding Rules

`default_bindings` declares the profile baseline. A high-risk provider tool may
add more fields, but it must not omit the profile baseline from
`authorization_requirements.bind_receipt_to`.

Common baseline fields are:

- `tenant_id`
- `agent_id`
- `user_id`
- `tool`
- `action`
- `resource`
- `job_id`

High-risk JIT tools should also bind `approval_id` and `jit_grant_id`. Domain
profiles can require additional fields such as `case_id`, `customer_id`,
`amount`, `currency`, `request_digest`, or `provider_idempotency_key`.

## Basis Handling

Receipts should avoid signing sensitive free-text rationale unless a profile
requires it. Prefer either:

- a categorical basis such as `policy_allow`, `human_approved`, or
  `out_of_scope`
- a reference such as `basis_ref` that points to an internal approval,
  audit-log, or case-management record

This lets verifiers and auditors correlate the decision without exposing
private policy details in every signed receipt.

## Verifier Expectations

Before executing a high-risk provider action, a verifier should check:

- signature or introspection validity
- trusted issuer and audience
- profile URI and canonicalization compatibility
- expiry and freshness
- exact tool, action, resource, tenant, agent, user, job, and approval bindings
- request digest if the profile requires one
- single-use or prior-outcome behavior for replayed receipt IDs
- profile-defined outcome semantics

Provider business authorization still runs after receipt verification. A valid
AgentPass receipt proves enterprise-side runtime authorization; it does not prove
the provider should mutate state.

## Failure Codes And Fixtures

Verifiers should preserve detailed human-readable findings but also return a
stable, ordered `codes` array for machine handling. The AgentPass reference
vocabulary currently includes `expired`, `revoked`, `already_consumed`,
`budget_exhausted`, `out_of_scope`, `unknown_key`, `invalid_signature`,
`missing_receipt`, `contract_drift`, `untrusted_issuer`, `wrong_audience`, and
`invalid_receipt`.

The executable reference cases are in
[`../fixtures/provider-receipt-v1/`](../fixtures/provider-receipt-v1/). They
cover valid, expired, revoked, out-of-scope, invalid-signature,
already-consumed, budget-exhausted, contract-drift, and missing-receipt
outcomes against the FastAPI provider reference verifier, as well as JWS
unknown-key handling and replayed prior outcomes.
