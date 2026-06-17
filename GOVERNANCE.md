# Governance

AgentPass uses a maintainer-led governance model. The goal is to keep the
project useful, secure, and predictable for people building AI agent execution
boundaries.

## Project Scope

AgentPass focuses on stateful runtime governance for AI agent tool calls:

- Tool allow, deny, and challenge decisions
- Job-scoped budgets and circuit breakers
- Approval and JIT grant scoping
- Idempotency and replay protection
- PII and data-flow controls
- Audit events and signed receipts
- MCP gateway and provider integration patterns
- SDKs, middleware, examples, and schemas that support those boundaries

Work outside this scope may still be discussed, but maintainers may decline or
redirect it to keep the project focused.

## Roles

**Users** open issues, test releases, report bugs, and share use cases.

**Contributors** submit issues, documentation, tests, examples, and code.

**Reviewers** provide trusted review in specific areas, such as Python core,
TypeScript packages, provider middleware, schemas, docs, or security.

**Maintainers** merge pull requests, manage releases, enforce project rules, and
make final decisions when consensus is not available.

**Security reviewers** help evaluate vulnerability reports and changes that
touch authorization, signing, verification, replay, approval, or audit behavior.
A security reviewer may also be a maintainer.

Current maintainers and review areas are listed in [MAINTAINERS.md](MAINTAINERS.md).

## Decision Making

Most decisions happen in issues and pull requests. Maintainers prefer rough
consensus backed by tests, examples, and clear compatibility analysis.

If consensus is not available, maintainers decide based on:

- User safety and security impact
- Compatibility with existing contracts
- Simplicity of the operational model
- Quality of tests and documentation
- Long-term maintenance cost
- Alignment with the project scope

For material design changes, open an issue before implementation. Material
changes include public API changes, schema changes, new trust assumptions,
receipt format changes, policy semantics, release process changes, or new
packages.

## Security-Sensitive Changes

Changes in the following areas require maintainer review and, when available,
security reviewer input:

- Authorization decision logic
- Receipt signing, verification, issuer, audience, algorithm, or key handling
- Replay stores, idempotency, and single-use execution behavior
- Approval scope, JIT grant scope, and expiry handling
- Audit event shape or retention assumptions
- PII/data-flow policy behavior
- Gateway forwarding behavior
- Example policies that users may copy into production

Security fixes may be developed privately until a fix and disclosure plan are
ready. See [SECURITY.md](SECURITY.md).

## Maintainer Changes

Maintainers may nominate contributors who have shown sustained, constructive
participation and sound judgment in the relevant area. Maintainer access should
be scoped to the area where it is needed when repository tooling allows it.

A maintainer may step down at any time. Maintainers may also remove inactive or
unresponsive maintainers after attempting private contact and documenting the
change in [MAINTAINERS.md](MAINTAINERS.md).

## Releases

Maintainers cut releases for published packages and document user-visible
changes in release notes or changelog entries. Release decisions should consider:

- Compatibility of public APIs and schemas
- Migration notes for breaking changes
- Security advisories and coordinated disclosure needs
- Package-specific tests and build checks
- Documentation for changed behavior

Breaking changes should be rare and clearly marked.

## Standards and External Alignment

AgentPass may track and contribute to related work in MCP, agent identity,
provider authorization, and receipt/profile standards. External standards work
should be linked from issues or docs so project decisions remain auditable.
