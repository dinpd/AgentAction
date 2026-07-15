# Provider Receipt Fixtures v1

`cases.json` is the executable reference corpus for a scoped provider tool
receipt. Each case uses the same high-risk CRM write, deterministic clock, and
HMAC fixture secret. The FastAPI reference verifier runs it in
`packages/provider-fastapi/tests/test_conformance_fixtures.py`.

The stable `expect.codes` vocabulary is intentionally separate from detailed
`findings`:

- `expired`
- `already_consumed`
- `out_of_scope`
- `unknown_key`
- `invalid_signature`
- `missing_receipt`
- `untrusted_issuer`
- `wrong_audience`
- `invalid_receipt`

The corpus currently covers stateless validation and single-use consumption.
Revocation, spend-ledger/budget, contract-drift, and prior-outcome replay need
stateful provider controls; they will be added as cases when that behavior is
implemented rather than treated as passing examples today.
