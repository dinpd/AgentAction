# Contributing to AgentAction

Thanks for contributing to AgentAction. This project sits on a security-sensitive
execution path for AI agents, so changes should be small, reviewable, and backed
by tests or examples where behavior changes.

## Before You Start

- Search existing issues and pull requests to avoid duplicate work.
- For large changes, open an issue first and describe the problem, proposed
  behavior, compatibility impact, and test plan.
- For security vulnerabilities, do not open a public issue. Follow
  [SECURITY.md](SECURITY.md).
- By submitting a contribution, you agree that it is licensed under the
  repository's [Apache-2.0 license](LICENSE). AgentAction does not currently use a
  separate CLA.

## Development Setup

Python package and core tests:

```bash
python -m pip install -e ".[dev]"
python -m pytest
```

TypeScript guard package:

```bash
cd packages/guard
npm ci
npm test
npm run build
```

TypeScript client SDK:

```bash
cd sdk/typescript
npm ci
npm test
npm run build
```

Provider Express middleware:

```bash
cd packages/provider-express
npm ci
npm test
npm run build
```

Provider FastAPI middleware:

```bash
python -m pytest packages/provider-fastapi/tests
```

Run only the checks relevant to your change, but note any checks you did not run
in the pull request.

## Contribution Standards

- Keep policy, schema, receipt, and gateway behavior deterministic.
- Add or update tests for changes in authorization decisions, receipt
  verification, replay handling, schema validation, budgets, approvals, or PII
  flow behavior.
- Do not weaken defaults for high-risk tools, PII movement, replay protection,
  approval scoping, or audit logging without an explicit design discussion.
- Keep examples free of real credentials, tokens, account IDs, customer data,
  and private endpoints.
- Preserve backward-compatible aliases unless a deprecation has been discussed
  and documented.
- Update documentation when public APIs, schemas, examples, policies, or
  deployment guidance changes.
- Keep generated or AI-assisted contributions under the same review standard as
  handwritten code. You are responsible for licensing, correctness, security,
  and test coverage.

## Pull Request Checklist

- The PR explains the problem and the behavior change.
- Tests, examples, or docs cover the change.
- Security impact is described for changes touching policy decisions, receipts,
  JWKS/JWS/HMAC verification, gateway behavior, approval flow, replay stores,
  audit events, or PII/data-flow checks.
- New dependencies are justified and scoped.
- Public API or schema changes are called out.
- Relevant checks were run locally or in CI.

## Review Expectations

Maintainers optimize for correctness, clear security boundaries, and stable
interfaces. A change may need additional review if it affects:

- Runtime allow/deny/challenge decisions
- Receipt signing or verification
- Replay protection and idempotency
- Approval or JIT grant scope
- Audit event shape
- Published package exports
- Provider integration contracts
- Example policies that users may copy into production

Reviewers may ask for a smaller diff, stronger tests, clearer docs, or a design
issue before merging.
