# Provider Receipt Fixtures v1

`cases.json` is the executable reference corpus for a scoped provider tool
receipt. Each case uses the same high-risk CRM write, deterministic clock, and
HMAC fixture secret. The FastAPI reference verifier runs it in
`packages/provider-fastapi/tests/test_conformance_fixtures.py`.

The stable `expect.codes` vocabulary is intentionally separate from detailed
`findings`:

- `expired`
- `revoked`
- `already_consumed`
- `budget_exhausted`
- `contract_drift`
- `out_of_scope`
- `unknown_key`
- `invalid_signature`
- `missing_receipt`
- `untrusted_issuer`
- `wrong_audience`
- `invalid_receipt`

The corpus covers stateless validation, revocation, single-use consumption, and
spend-capped consumption, contract pinning, and JWS unknown-key handling.
Prior-outcome replay remains pending until the corresponding provider control is
implemented.
