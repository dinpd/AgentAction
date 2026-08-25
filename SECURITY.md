# Security Policy

AgentAction is designed for security-sensitive AI agent execution paths. Please
report vulnerabilities privately so maintainers can investigate and coordinate a
fix before public disclosure.

## Supported Versions

The project is early-stage. Security fixes target the default branch first.
Maintainers may backport critical fixes to published package versions when the
affected package has active users and the patch is practical.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability.

Report privately to the maintainers using GitHub private vulnerability reporting
when available. If that is not available, contact the maintainer listed in
[MAINTAINERS.md](MAINTAINERS.md) through a private channel.

Include as much detail as you can safely share:

- Affected package, component, version, commit, or deployment mode
- Description of the vulnerability and expected impact
- Minimal reproduction steps or proof of concept
- Whether the issue is public, exploited, or known to third parties
- Suggested fix or mitigation, if known

Please do not include real secrets, customer data, production account IDs, or
private logs unless maintainers explicitly request a secure transfer path.

## Scope

Examples of in-scope issues:

- Incorrect allow/deny/challenge decisions for guarded tool calls
- Bypass of approval, JIT grant, idempotency, replay, or budget controls
- Receipt forgery, weak verification, issuer or audience confusion, algorithm
  confusion, key handling errors, or JWKS caching flaws
- PII/data-flow policy bypass
- Audit events missing security-relevant decision context
- Provider middleware accepting malformed or replayed receipts
- Gateway behavior that forwards a guarded call after denial
- Example policies or docs that create a materially unsafe default

Examples usually out of scope:

- Issues that require full control of the host application or runtime
- Missing hardening for demo-only HMAC examples when clearly documented as
  non-production
- Denial-of-service reports without a plausible impact on realistic deployments
- Vulnerabilities in unrelated dependencies with no AgentAction-specific exposure

## Response Process

Maintainers will try to acknowledge credible reports within 5 business days.
After triage, maintainers will aim to:

- Confirm impact and affected components
- Develop and test a fix
- Prepare release notes or an advisory when needed
- Coordinate disclosure timing with the reporter
- Credit the reporter unless they prefer not to be named

Timeline depends on severity, complexity, and availability of a safe fix.

## Public Disclosure

Please give maintainers a reasonable opportunity to fix and release before
public disclosure. Maintainers may publish an advisory for confirmed issues that
affect users.
