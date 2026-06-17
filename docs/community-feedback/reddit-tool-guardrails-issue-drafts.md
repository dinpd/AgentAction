# Reddit tool-call guardrails issue drafts

Source thread: "What guardrails are you using around agent tool calls?" on
`r/aiagents`, June 2026.

These are draft GitHub issues based on community feedback. They are written to
be copied into repository issues with light editing.

## Issue: Provider trust gate for signed contracts and drift detection

### Context

Community feedback separated two gates that are often collapsed:

- Permission gate: should this agent make this call, in this job, with this
  payload, approval, budget, and retry history?
- Trust gate: is the provider or tool being called still the reviewed thing,
  with the expected identity, schema, contract, behavior, and execution
  guarantees?

AgentPass currently has strong permission-gate primitives: stateful budgets,
idempotency, one-shot approvals, JIT grants, data-flow checks, and audit events.
The provider-side trust gate needs to become equally explicit.

### Problem

A governed agent can still send money or data to a tool or counterparty whose
behavior, schema, issuer, or implementation changed after review. This is not a
tool-loop failure. It is a trust-boundary failure.

### Proposal

Add a provider trust gate design that verifies high-risk provider tools before
execution.

The trust gate should support:

- Provider identity and trusted issuer checks.
- Signed or introspected provider authorization contracts.
- Tool schema hash and contract version verification.
- Receipt profile compatibility.
- Drift detection for newly exposed tools, changed schemas, changed risk
  metadata, changed resource mappings, and changed receipt requirements.
- Provider execution receipts that can be correlated with enterprise-side
  authorization decisions.
- Clear failure tagging: `permission_failure` vs `trust_failure`.

### Acceptance criteria

- Documentation clearly distinguishes permission failures from trust failures.
- Provider contract verification has a concrete API or workflow proposal.
- Drift findings are machine-readable and human-readable.
- High-risk provider examples show both enterprise authorization and provider
  verification.
- Audit events include enough fields to reconstruct whether a failure happened
  at the permission gate or trust gate.

### Related docs

- `docs/provider-mcp-authorization.md`
- `docs/receipt-profiles.md`
- `docs/standards-alignment.md`

## Issue: Approval evidence schema and bound decision context

### Context

Community feedback noted that approvals need evidence, not only an
`approved=true` flag. The approver should see what is being approved, why it is
needed, what policy triggered it, and what exact scope the approval will bind.

### Problem

Weak approval flows become broad session grants. They are hard to review, hard
to audit, and easy to reuse for a different action.

### Proposal

Define a first-class approval evidence schema used consistently by local guard
decisions, gateway approval requests, SDK types, audit events, and UI.

Approval evidence should include:

- `agent_id`
- `user_id`
- `tenant_id`
- `job_id`
- `case_id` or domain-specific task ID
- `tool`
- `action`
- `resource`
- `amount` and `currency` when relevant
- `data_from`
- `data_to`
- `destination_type`
- `external_domain`
- `field_set`
- `record_count`
- `idempotency_key`
- `call_fingerprint`
- `request_digest` or payload hash for high-risk mutations
- `policy_version`
- `policy_findings`
- `prior_attempt_count`
- `budget_state`
- `expires_at`
- `basis_category` or `basis_ref`

### Acceptance criteria

- Approval request creation requires enough context for risky actions.
- JIT grant issuance validates that approval context still matches the requested
  action.
- SDK request/response types expose approval evidence fields.
- Approval UI displays evidence without relying on free-text summaries.
- Audit events link approval evidence, JIT grant, and final tool decision.

## Issue: Decision context audit trail for compliance review

### Context

Community feedback highlighted a third layer beyond permission and trust:
post-execution audit that a non-technical reviewer can understand.

Raw tool logs show what happened. They often do not show why the action was
allowed at the time.

### Problem

Compliance, incident review, and customer dispute workflows need to answer:

> Show me what this agent did last Tuesday and why it was sanctioned.

A raw tool call cannot answer that unless it is linked to job context, approval
scope, policy version, data-flow decision, and receipt/JIT state.

### Proposal

Extend the decision-event and audit model so every high-risk action has a
reviewable decision context.

Audit records should include:

- Raw proposed tool call.
- Normalized action classification.
- Job/task/case/customer context.
- Policy version and relevant policy findings.
- Approval request ID and approval scope.
- JIT grant ID and receipt ID.
- Idempotency key or call fingerprint.
- Data-flow decision.
- Budget state at time of decision.
- Gate result: `allow`, `deny`, or `challenge_required`.
- Failure class: `permission_failure`, `trust_failure`,
  `business_auth_failure`, `execution_failure`, or `unknown`.
- Human-readable decision summary.

### Acceptance criteria

- Audit events can reconstruct "why allowed" without reading model transcripts.
- Decision summaries are stable enough to show in an audit console.
- Events correlate enterprise authorization, provider verification, and provider
  execution receipts when available.
- Audit export preserves the same fields as the built-in console.

## Issue: Idempotency result cache for duplicate side-effect suppression

### Context

Community feedback described duplicate side effects caused by legitimate retry
paths: network blips, timeouts, regeneration, and model re-emitting the same
plan after a tool already executed.

The suggested production pattern is a deterministic idempotency key from:

```text
job_id + step_name + normalized_args_hash
```

The gate deduplicates on that key and returns the cached result instead of
re-executing.

### Problem

Denying duplicate calls prevents repeat side effects, but it can leave the agent
without the successful result of the first execution. Returning the cached
result is often a better retry behavior for side-effectful tools.

### Proposal

Add optional result-cache behavior for side-effectful tool calls.

The gate should support:

- User-provided idempotency keys.
- Helper-generated deterministic keys from stable job and argument fields.
- Normalized argument hashing.
- Per-tool TTLs.
- Storing prior terminal outcomes for an idempotency key.
- Returning cached success for exact duplicate retries.
- Returning `already_consumed` or `out_of_scope` when the same key is reused
  with different bound fields.
- Audit events for first execution and replayed result.

### Acceptance criteria

- Duplicate retry with same idempotency key and same digest returns prior result
  without executing the tool.
- Same key with changed digest/resource/action is denied as out of scope.
- Policy can choose deny-only mode or cached-result replay mode.
- Tests cover refund/email/export examples.

## Issue: Document stateless vs stateful enforcement boundaries

### Context

Community feedback separated stateless gateway checks from stateful job checks.

Some checks can run in a proxy before a tool server:

- Allowed server list.
- Blocked tool list.
- Basic payload validation.
- Injection scans.
- Per-tool rate limits.

Other checks require durable job state:

- This exact side effect already happened.
- This approval was already consumed.
- This job crossed a token/cost/runtime budget.
- This idempotency key already has a terminal outcome.

### Problem

Agent builders need guidance on where to place AgentPass: inside tools, inside
agent frameworks, at an MCP gateway, or in custom middleware. The answer depends
on whether the control needs job state.

### Proposal

Add documentation that maps each guardrail to its correct enforcement boundary.

The doc should cover:

- Local guard package.
- MCP `tools/call` wrapper.
- Enterprise gateway.
- Provider-side receipt verifier.
- Durable state store.
- Tool implementation fallback checks.

### Acceptance criteria

- Docs include a table of guardrail, required state, recommended boundary, and
  failure behavior.
- Examples show when stateless proxy checks are sufficient.
- Examples show when a durable AgentPass state store is required.
- Guidance warns against relying on prompt memory for enforcement.

## Issue: Budget soft caps and structured capability degradation

### Context

Community feedback suggested max iterations, budget thresholds, and smaller
model degradation. Another concrete pattern was soft budget warnings that the
agent can see before hard caps deny execution.

### Problem

Hard budget caps are necessary, but they can fail late. Soft caps can steer the
workflow earlier, but only if the signal is structured and the runtime defines
what capability degradation actually means.

### Proposal

Extend budget handling with structured soft-cap outputs.

Budget soft caps should support:

- Warning thresholds for tool calls, same-tool calls, tokens, estimated cost,
  runtime, and retry count.
- Structured warning events visible to the agent or orchestrator.
- Optional `challenge_required` before hard denial.
- Explicit capability degradation plans, such as disabling external sends,
  exports, browser automation, write tools, or high-cost model calls.
- Avoid silent smaller-model fallback for high-risk capabilities unless policy
  explicitly allows it.

### Acceptance criteria

- Budget soft-cap response is machine-readable.
- Policy can choose warn, challenge, degrade, or deny.
- Degradation disables named capabilities rather than silently weakening safety.
- Tests cover soft warning before hard token/cost caps.
