## Summary

Describe the problem and the change.

## Security Impact

Does this affect allow/deny/challenge decisions, receipts, replay protection,
approval scope, PII/data-flow behavior, gateway forwarding, or audit events?

## Compatibility Impact

Call out public API, schema, package export, policy, receipt, or documentation
changes.

## Test Plan

List the checks you ran. If a relevant check was not run, say why.

- [ ] `python -m pytest`
- [ ] `cd packages/guard && npm test && npm run build`
- [ ] `cd sdk/typescript && npm test && npm run build`
- [ ] `cd packages/provider-express && npm test && npm run build`
- [ ] `python -m pytest packages/provider-fastapi/tests`

## Checklist

- [ ] Tests or examples cover the behavior change.
- [ ] Documentation was updated or is not needed.
- [ ] No secrets, private data, or production identifiers were added.
- [ ] New dependencies are justified.
- [ ] Breaking changes are documented.
