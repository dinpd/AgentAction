# Agent Action Gate Roadmap

This roadmap documents the near-term product direction for AgentPass.

The positioning target is:

> AgentPass is the runtime action gate for AI agents before they call tools,
> send messages, move money, update records, deploy code, or touch sensitive
> data.

The developer problem is not only agent identity. Builders already have agents,
tools, API keys, MCP servers, workflow engines, and model calls. What they lack
is a small, reliable control point that answers:

> Should this proposed agent action execute right now, with these arguments, for
> this user, job, resource, approval state, and data-flow boundary?

AgentPass should meet developers where they are: agent loops, MCP gateways,
workflow automations, browser agents, payment tools, CRM tools, email tools,
internal APIs, and production-change tools.

## Audience Signal

The target builder audience is pragmatic and skeptical. The strongest recurring
needs are:

- Bounded automations instead of open-ended autonomy.
- Protection from rogue actions such as duplicate refunds, unintended sends,
  destructive updates, and runaway loops.
- Human step-up for high-risk actions.
- Closed-world action spaces for regulated workflows.
- PII and sensitive-data exfiltration controls before customer records leave the
  system or enter an unsafe destination.
- Token, retry, and tool-call spend controls as a backstop against runaway
  loops.
- Audit trails that can explain what happened after a failed or disputed action.
- Drop-in integration with existing agent frameworks, not a full platform
  migration.

The product should therefore feel less like identity infrastructure and more
like Stripe idempotency, GitHub branch protection, API gateway policy, and a
payment circuit breaker for agent tool calls.

Community-feedback artifacts from the June 2026 `r/aiagents` tool-call
guardrails thread are tracked in:

- [`community-feedback/reddit-tool-guardrails-issue-drafts.md`](community-feedback/reddit-tool-guardrails-issue-drafts.md)
- [`community-feedback/reddit-tool-guardrails-response-drafts.md`](community-feedback/reddit-tool-guardrails-response-drafts.md)

The lead wedge should be external side effects and sensitive data, not token
cost alone. Token spend matters, but it is usually a symptom of an unbounded
agent loop. The stronger product story is:

> Stop real-world damage first; cap runaway execution as part of the same guard.

## Positioning Principles

- Lead with runtime protection for agent actions.
- Treat identity as an input to authorization, not the product category.
- Say "deterministic gate" only for the enforceable control plane. The model
  remains probabilistic.
- Prefer concrete failure modes over abstract governance language.
- Keep standards alignment available for deeper review, but do not make DID,
  VC, or broad identity messaging the first developer touchpoint.
- Keep the AgentPass name for now. Test the action-gate positioning before
  committing to another rename.

Recommended public line:

> AgentPass is a runtime guard for AI agent tool calls.

## Roadmap

### Current Status Snapshot

As of 2026-06-17, this roadmap is no longer a pure future plan. The public
README now leads with the runtime tool-call guardrail story, the local
TypeScript guard is implemented and published as `@dinpd/ai-agent-guard`, and
the repo includes runnable demos, starter policies, a dependency-free MCP
tool-call adapter in the guard package, a separate MCP gateway adapter,
provider-side Express and FastAPI middleware, and a Cloudflare gateway runtime
with durable approvals, JIT grants, tenant manifests, OIDC checks, and audit
events.

As of 2026-06-25, the MCP gateway adapter also has a local guard mode. This is
the standards-facing demo path for the MCP/interceptor audience: it enforces
policy at `tools/call` time, preserves process-local job state, blocks duplicate
side effects, stops tool thrashing, and denies PII egress before forwarding to a
downstream MCP server.

The remaining near-term work is less about proving the basic guard pattern and
more about hardening the production boundary:

- make result replay for idempotent side effects explicit;
- make approval evidence and decision context consistent across SDK, gateway,
  UI, and audit events;
- close the provider trust gate with signed contracts, drift detection, and
  provider execution receipts;
- document stateless versus stateful enforcement boundaries;
- add more integration guides around the existing packages.
- align the gateway adapter with emerging MCP interceptor/PDP shapes without
  requiring AgentPass to become the network gateway.

### Demonstrable Feature Priority

Roadmap execution is prioritized by demonstrable behavior, not by the phase
number or the amount of supporting infrastructure involved. A priority is done
only when a user can run or view the complete flow, see the decision state
change, inspect the audit evidence, and reproduce the result with an automated
test.

This document is the source of truth for priority and sequencing. GitHub issues
are the implementation units and may be worked only when they advance the
current priority or remove a direct blocker. Other `Next`, `Priority`, issue
draft, and implementation-roadmap sections in the repository are supporting
references, not separate ordered backlogs.

Current issue mapping:

| Priority | Demonstration | Tracking issues |
| --- | --- | --- |
| P0 | Hosted approval to single-use execution | [#3 approval evidence](https://github.com/dinpd/AgentPass/issues/3), [#4 decision audit context](https://github.com/dinpd/AgentPass/issues/4) |
| P1 | Double-refund protection with result replay | [#5 idempotency result cache](https://github.com/dinpd/AgentPass/issues/5), [#9 execution correlation](https://github.com/dinpd/AgentPass/issues/9), [#12 duplicate-refund guide](https://github.com/dinpd/AgentPass/issues/12) |
| P2 | Hosted PII egress gate | [#10 hosted data-flow parity](https://github.com/dinpd/AgentPass/issues/10) |
| P3 | Production deploy action gate | Create a focused issue when P2 is complete; existing DevOps code is reference implementation |
| P4 | Provider trust gate | [#2 provider trust gate](https://github.com/dinpd/AgentPass/issues/2), [#8 production JWS/JWKS](https://github.com/dinpd/AgentPass/issues/8), [#9 execution receipts](https://github.com/dinpd/AgentPass/issues/9) |
| P5 | Framework and workflow distribution | [#13 OpenAI Agents SDK wrapper](https://github.com/dinpd/AgentPass/issues/13); select additional wrappers from adopter demand |

Issues [#6](https://github.com/dinpd/AgentPass/issues/6),
[#7](https://github.com/dinpd/AgentPass/issues/7), and
[#11](https://github.com/dinpd/AgentPass/issues/11) are supporting work. They
should not displace the active demonstrable priority unless they become a
blocker. Issue #12's guide is part of P1's completion gate, not a standalone
documentation priority.

#### P0: Hosted Approval To Single-Use Execution (complete)

Demonstrate the core product loop in one visible flow:

```text
agent action -> challenge -> human review -> scoped JIT grant -> execute once
             -> replay denied -> correlated audit trail
```

Ship together:

- Approval inbox UI backed by durable approval requests, with mock mode only as
  an unauthenticated preview.
- One consistent approval evidence object across the guard SDK, Cloudflare
  gateway, approval UI, JIT grant, and audit event.
- Approver identity, exact action scope, policy findings, request digest,
  expiration, and decision reason displayed before approval.
- A visible event timeline linking the challenge, approval, grant consumption,
  execution decision, and replay denial.

Demo gate:

- A reviewer can approve a production-like action from the UI.
- The exact approved action succeeds once.
- A changed resource, amount, destination, or payload is denied.
- A replay or expired grant is denied.
- Automated tests cover approval, scope mismatch, single-use consumption, and
  audit correlation.

Completion status:

- The Cloudflare runtime exposes a durable, filterable approval queue.
- `agentpass.approval-evidence.v1` is emitted by the local guard and carried by
  hosted approval requests, JIT grants, the TypeScript client, audit events,
  and the approval console.
- Hosted decisions require approver identity and a decision reason, expire
  deterministically, and bind the approved scope with a canonical SHA-256
  request digest.
- The approval console demonstrates review, decision, JIT issuance, one-time
  authorization, replay denial, and a correlated audit timeline.
- Cloudflare lifecycle tests cover approval, scope drift, expiry, consumption,
  replay denial, and audit correlation.

#### P1: Double-Refund Protection With Result Replay (complete)

Turn the strongest existing local demo into the clearest side-effect safety
proof. When a provider completed a refund but the agent timed out, the retry
must return the cached prior result instead of issuing a second refund or only
returning a denial.

Ship together:

- Idempotency record lifecycle and cached-result replay.
- Request digest validation so the same key cannot authorize changed inputs.
- Provider execution receipt correlated with the authorization decision.
- Console or UI timeline showing the first execution and replayed result.

Demo gate:

- Simulate a timeout after a successful refund.
- Retry the identical request and return the original result without another
  provider mutation.
- Retry changed arguments under the same key and deny the request.
- Prove with an automated test that the provider mutation ran exactly once.

Completion status:

- Local `createToolGate` caches successful idempotent execution results with a
  stable request digest and provider execution receipt.
- Hosted `POST /execution-results` records completed provider results in the
  Durable Object store after the first allowed execution.
- Identical retries to hosted `/authorize` return the cached provider result
  with `replayed: true` without consuming another provider mutation.
- Changed refund arguments under the same idempotency key are denied locally and
  in the hosted gateway.
- The approval console records a provider result after execution and shows
  execution/replay events in the correlated audit timeline.
- Automated tests prove local and hosted provider mutations run exactly once for
  identical retries and deny changed retry scope.

#### P2: Hosted PII Egress Gate

Move the richer local data-flow enforcement into the hosted path and show that
an allowed read cannot silently become an unsafe send, export, browser action,
or model-provider prompt.

Ship together:

- Hosted and SDK parity for source, destination, classification, fields,
  record count, external domain, redaction status, and retention context.
- Approval UI evidence for the exact fields and destination under review.
- Audit export containing the same data-flow context as the decision.

Demo gate:

- Allow an approved internal CRM read.
- Deny blocked fields such as `ssn` and `access_token` at every destination.
- Challenge an allowed PII export to a new external destination.
- Allow the approved exact export and deny a changed domain or field set.
- Cover email, webhook, browser form, model-provider prompt, and file export in
  automated tests.

#### P3: Production Deploy Action Gate

Prove that the same runtime protects an operational action, not only payments
and customer data.

Ship together:

- One real integration, starting with GitHub Actions workflow dispatch unless
  implementation constraints make another target materially simpler.
- Policy requiring environment, repository, branch, commit SHA, change request,
  human approval, and a single-use grant.
- A rollback path bound to an incident ID and rollback plan.

Demo gate:

- Read-only inspection succeeds without production authority.
- Deploy without a change request or approval is challenged or denied.
- An approved commit deploys once.
- A different commit, environment, or replay is denied.
- The decision and workflow execution are correlated in the audit timeline.

#### P4: Provider Trust Gate

Close the authorization loop at the provider boundary after the first three
user-visible safety flows are complete.

Ship together:

- Production JWS authorization receipts and a JWKS endpoint.
- Key rotation and unknown-`kid` refresh behavior.
- Signed provider contracts and drift checks for high-risk tools.
- Provider execution receipts correlated with enterprise authorization.
- Structured trust-gate failure classes.

Demo gate:

- A valid scoped receipt executes at the provider.
- Expired, replayed, wrongly scoped, unknown-key, and drifted-contract requests
  fail closed with distinct machine-readable reasons.
- Key rotation succeeds without disabling verification.

#### P5: Framework And Workflow Distribution

Add integrations only after the underlying feature being wrapped has a stable
end-to-end demonstration. Select the next wrapper from real adopter demand;
the current candidates are OpenAI Agents SDK, Claude tool use, LangChain,
workflow webhooks, OpenClaw-style loops, and n8n or Zapier examples.

Demo gate:

- Each integration includes one minimal allow case and one high-risk
  challenge/deny case.
- Every adapter maps into the same decision, approval evidence, and audit event
  types.
- Missing required context fails closed.

Work that does not directly unlock these demonstrations is lower priority:

- additional positioning or naming work;
- broad governance dashboard work;
- multiple framework wrappers developed in parallel;
- standalone documentation without a runnable flow;
- structured budget degradation beyond the existing enforceable limits.

### Phase 1: Reposition Without Renaming (complete)

Goal: make the action-gate story obvious without changing packages, schemas, or
existing integrations.

Completed:

- The README leads with "stateful guardrails around AI agent tool calls."
- The primary execution diagram is in the README:

  ```text
  Agent proposes tool call -> AgentPass checks policy + state -> allow / deny / challenge
  ```

- Identity/passport language is secondary to the runtime authorization story.
- The README, guard docs, and demos now focus on concrete failures: duplicate
  refunds, unsafe sends, payment approval, PII egress, production changes, and
  runaway tool calls.
- The deeper authority-contract model remains available for manifests,
  gateways, provider contracts, receipts, and standards alignment.

Original work items now satisfied:

- Update the README and primary docs to lead with runtime guardrails for AI
  agent tool calls.
- Add the core execution diagram:

  ```text
  Agent proposes tool call -> AgentPass checks -> allow / deny / challenge
  ```

- Move identity/passport language below the runtime authorization story.
- Add examples around concrete failures:
  - duplicate refund
  - unsafe CRM update
  - external email send
  - payment approval
  - PHI/PII export
  - production deploy or rollback
  - data export to an unapproved destination
  - repeated failed tool calls burning through a job budget
- Keep the existing authority-contract model as the deeper policy layer.

Exit criteria status:

- Done: a new visitor should understand AgentPass as a tool-call guard within
  30 seconds.
- Done: the README shows where AgentPass sits in an existing agent loop.
- Done: the first examples describe action failures, not abstract identity
  gaps.

### Phase 2: Build The Drop-In Guard (mostly complete)

Goal: provide the smallest useful runtime guard API for existing agents and
automations.

Completed:

- Local TypeScript guard package exists at `packages/guard`.
- The guard package is published on npm as `@dinpd/ai-agent-guard`.
- `createToolGate` wraps arbitrary tool execution.
- `createMcpToolGate` wraps MCP-style `tools/call` requests.
- Structured decisions return `allow`, `deny`, or `challenge_required`.
- Decision events are emitted for every check.
- Starter policies exist for spend caps, PII egress, refunds/payments,
  shell/browser actions, and MCP tool gateways.
- Demos exist for quickstart, MCP, support refunds, circuit breakers, direct
  tool gates, and PII exfiltration.

Target shape:

```ts
const decision = await agentpass.guard({
  agentId: "support-agent",
  tool: "stripe.refund",
  action: "pay",
  resource: "payment/pi_123",
  amountUsd: 49,
  userId: "user_456",
  jobId: "case_789",
  dataFrom: "stripe",
  dataTo: "stripe",
  idempotencyKey: "refund-case_789-pi_123"
});

if (decision.type === "challenge_required") {
  return askHuman(decision.challenge);
}

if (decision.type === "deny") {
  throw new Error(decision.reasons.join("; "));
}
```

Capabilities:

- Closed-world tool list.
- Action classification: `read`, `write`, `send`, `delete`, `pay`, `deploy`,
  `export`, `admin`.
- Resource binding.
- Data source and destination binding.
- Max amount, max sends, max records, max calls, and max retries.
- Max tokens, max estimated cost, and budget per job.
- Human approval rules.
- Idempotency keys.
- Single-use grant consumption.
- Replay protection.
- Audit event on every decision.
- Fail-closed behavior when required context is missing.

Developer-entrypoint work status:

- Done: provide a five-minute local demo that shows a normal tool call, a
  repeated tool-call denial, and a PII approval challenge.
- Done: ship copy-paste starter policies for tool spend, PII egress,
  refunds/payments, shell/browser tools, and MCP-style provider tools.
- Done: make the package installable with a lockfile-backed `npm install` path.
- Done: publish the package to npm as `@dinpd/ai-agent-guard`.
- Done: add the first named adapter as a dependency-free MCP `tools/call`
  wrapper.
- Partial: add the next framework wrapper based on feedback from local guard and
  MCP users. Provider-side Express and FastAPI middleware exist; agent framework
  wrappers such as OpenAI Agents SDK, Claude tool-use, and LangChain remain
  future work.

Exit criteria status:

- Done: a developer can add AgentPass before a tool call with a small code
  change.
- Done: a deny/challenge result is structured enough to render in a UI or
  workflow.
- Partial: the decision event contains enough context for local debugging, but
  approval evidence, policy version, trust-gate failure class, and
  provider-execution correlation need to be made consistent across all runtimes.

Test gate:

- `cd packages/guard`
- `npm test`
- `npm run build`
- `npm run demo:quickstart`
- `npm run demo:mcp`
- `npm run demo`
- `npm run demo:circuit`
- `npm run demo:gate`
- `npm run demo:pii`

Expected outcomes:

- Unknown tools are denied.
- Refunds without approval return `challenge_required`.
- Approved refunds execute once.
- Duplicate refund retries are denied by idempotency.
- PII sends to unapproved destinations are denied.
- Tool-call, retry, token, and estimated-cost budgets are enforced.
- Tool-thrashing circuit breakers stop repeated identical calls and same-tool
  loops.
- Starter policies exist for the first five developer problems: spend caps, PII
  egress, refunds/payments, shell/browser actions, and MCP tool gateways.

Remaining work:

- Add optional cached-result replay for duplicate side-effect retries.
- Promote approval evidence fields into SDK and gateway request/response types.
- Add structured budget warning/degradation outputs beyond
  `challenge_required`.

### Phase 3: PII And Sensitive-Data Exfiltration Rules (mostly complete locally)

Goal: make data movement a first-class runtime policy primitive, not a secondary
audit concern.

Completed in the local guard:

- `dataFrom`, `dataTo`, `destinationType`, `dataClassification`, `fieldSet`,
  `recordCount`, and `externalDomain` are part of `GuardCheck`.
- Flow policies support allow/deny, approval requirements, destination allow
  lists, field allowlists, blocked fields, and record caps.
- Sensitive destinations include external email, webhooks, third-party SaaS,
  file export, model providers, and browser forms.
- PII exfiltration examples and tests cover model-provider prompts, external
  destinations, blocked fields, and record thresholds.

Remaining work:

- Bring the richer local guard data-flow model into the hosted gateway and SDK
  surfaces consistently.
- Add redaction/tokenization status and retention-policy fields when available.
- Document how tool-result-to-tool-call chains should be represented and
  blocked.
- Ensure audit export includes the same data-flow context as local decision
  events.

Agent systems fail when a harmless read is chained into an unsafe write, send,
export, prompt, or tool call. AgentPass should model and enforce these flows
directly.

In this roadmap, data exfiltration primarily means PII, PHI, payment data,
customer records, credentials, secrets, and other regulated or confidential
fields leaving an approved boundary.

Core concepts:

- `data_from`: where data originated.
- `data_to`: where data is being sent or used.
- `data_classification`: public, internal, confidential, PII, PHI, payment,
  secret, regulated, customer_data.
- `destination_type`: agent_context, user_response, internal_tool,
  external_email, webhook, third_party_saas, file_export, model_provider,
  browser_form, payment_network.
- `record_count`: number of records or rows affected.
- `field_set`: explicit fields requested, read, sent, or exported.
- `external_domain`: destination domain for sends, webhooks, forms, and uploads.
- `retention_policy`: whether the destination may store or train on the data.

Rules to support:

- Block secrets from entering prompts, browser forms, external emails, and
  third-party tools.
- Block PII/PHI/customer data from external destinations unless the destination
  is explicitly allowed.
- Require approval for exports above a record-count threshold.
- Require approval before sending customer data to a new domain.
- Require field allowlists for CRM, billing, healthcare, and support tools.
- Block cross-customer mixing unless a job explicitly allows aggregate analysis.
- Block tool-result-to-tool-call chains when untrusted data tries to determine
  the next action, recipient, resource, amount, or destination.
- Require redaction or transformation before data moves into an LLM prompt.
- Enforce destination-specific retention constraints when available.
- Emit an audit event for every allowed, denied, or challenged data movement.

PII-specific rules to support:

- Require explicit field allowlists for any tool that reads or exports customer
  records.
- Deny export of high-risk identifiers such as SSN, government ID, access token,
  payment method, health record ID, or full date of birth unless a policy
  explicitly permits them.
- Require approval when PII moves from a system of record into email, webhook,
  browser automation, model-provider prompt, file export, or third-party SaaS.
- Redact or tokenize PII before sending it to an LLM when the downstream task can
  be completed without raw identifiers.
- Record field names, destination, record count, job, user, approval, and
  redaction status in the audit event.

Example policy shape:

```yaml
flows:
  - from: provider_crm
    to: agent_context
    destination_type: agent_context
    data_classification:
      - customer_data
      - pii
    allowed_fields:
      - customer_id
      - case_id
      - plan
      - renewal_date
    max_records: 10

  - from: provider_crm
    to: external_email
    destination_type: external_email
    data_classification:
      - customer_data
      - pii
    requires_approval: true
    allowed_domains:
      - customer.example
    blocked_fields:
      - ssn
      - access_token
      - payment_method

  - from: provider_crm
    to: model_provider
    destination_type: model_provider
    data_classification:
      - pii
    decision: deny
    blocked_fields:
      - ssn
      - access_token
      - payment_method
      - full_date_of_birth
      - health_record_id

  - from: secrets_manager
    to: model_provider
    decision: deny
```

Exit criteria:

- Data-flow decisions use the same allow/deny/challenge lifecycle as tool
  actions.
- Sensitive reads cannot silently become unsafe sends or exports.
- Audit logs can reconstruct source, destination, fields, count, and approval.

Test gate:

- Add tests where PII moves from CRM to email, webhook, browser form,
  model-provider prompt, and file export.
- Add tests for blocked fields: `ssn`, `access_token`, `payment_method`,
  `full_date_of_birth`, and `health_record_id`.
- Add tests for field allowlists and record-count thresholds.

Expected outcomes:

- Approved internal reads are allowed.
- PII to unapproved external destinations is denied.
- PII to approved destinations returns `challenge_required` when approval is
  absent.
- Blocked fields are denied even when the destination is approved.

### Phase 4: Killer Demos (partially complete)

Goal: prove the product through concrete failure prevention.

Completed:

- Local guard demos cover quickstart, MCP tool calls, support refunds, circuit
  breakers, direct tool gates, and PII exfiltration.
- The README links the core demos and starter policies.
- The guard package has tests covering repeated calls, budgets, PII flows,
  approvals, and MCP mappings.

Remaining work:

- Turn the strongest demos into short guides with screenshots or console output.
- Add a clearer timeout/retry flow where a duplicate side-effect retry returns a
  cached prior result rather than only a denial.
- Add visible end-to-end event streams for the hosted gateway demos.
- Add one production-change demo around deploy/rollback/change-request
  enforcement.

Primary demo:

> Stop an agent from double-refunding after a timeout.

Flow:

1. Agent reads customer and order data. AgentPass allows the read.
2. Agent proposes a refund. AgentPass returns `challenge_required`.
3. Human approves. AgentPass issues a short-lived, single-use grant.
4. Refund executes with a signed receipt.
5. Agent retries after timeout. AgentPass denies replay/idempotency violation.
6. Audit log shows the decision chain.

Secondary demos:

- Agent tries to email a customer list to an unapproved domain.
- Agent tries to update a CRM field outside the active case boundary.
- Agent tries to run a payment above the configured amount cap.
- Agent tries to export PHI without approval.
- Agent tries to deploy without a change request and approval.
- Agent enters a retry loop and exceeds max tool calls, tokens, or cost.

Exit criteria:

- Each demo has a one-command local run path.
- Each demo has a visible allow/challenge/deny event stream.
- Each demo maps to one short guide.

Test gate:

- Every demo must be covered by at least one automated test and one runnable
  script.
- Demo output must include a decision event with `agentId`, `tool`, `action`,
  `jobId`, `resource`, reason list, and timestamp.

### Phase 5: Approval And JIT Runtime (partially complete)

Goal: make the runtime production-credible.

Completed:

- Cloudflare Worker gateway exposes `/authorize`, `/approval-requests`,
  `/jit-grants`, tenant-scoped endpoints, `/policy`, and audit endpoints.
- Approval requests and JIT grants use a SQLite-backed Durable Object namespace.
- JIT grants support expiration and single-use consumption.
- The gateway supports tenant manifests from KV.
- The gateway supports API-key auth and OIDC/JWKS validation for production
  tenant configs, plus demo HS256 mode.
- The gateway emits audit events and can export them through a webhook.
- Local provider demos support signed receipt-style verification paths.

Still open:

- Make approval evidence schema consistent across gateway, SDK, UI, and audit.
- Tighten approver identity and approval scope validation.
- Add production JWS/JWKS receipt signing as the default provider path.
- JWKS endpoint.
- Key rotation plan.
- Finish stable audit event schema and versioning.
- Add execution receipts that correlate provider execution with enterprise
  authorization.
- Add trust-gate failure classification.

Exit criteria status:

- Partial: sensitive actions can be challenged, approved, granted, and audited
  in the Cloudflare runtime.
- Partial: replays and expired grants are denied deterministically for JIT
  grants; cached-result replay for side-effect retries still needs design and
  implementation.
- Partial: providers can verify scoped receipts in demos, but production
  JWS/JWKS, key rotation, and execution receipts remain open.

### Phase 6: Integrations For Existing Builders (in progress)

Goal: put the gate where developers already execute tools.

Implemented or started:

- Plain TypeScript tool wrapper.
- MCP `tools/call` wrapper.
- MCP gateway adapter.
- Provider-side Express middleware.
- Provider-side FastAPI middleware.
- Cloudflare gateway runtime.

Priority integrations still open:

- OpenAI Agents SDK wrapper.
- Claude tool-use wrapper.
- LangChain middleware.
- MCP gateway middleware.
- Webhook guard for workflow systems.
- OpenClaw-style local agent loop example.
- n8n or Zapier-style examples if a clean integration path exists.

Exit criteria:

- Each integration has a minimal example and a high-risk example.
- Tool-call context maps into the same AgentPass decision object.
- Integrations fail closed when required guard context is absent.

### Phase 7: Recipes, Not Whitepapers

Goal: write docs around the problems builders search for.

Guides:

- Stop an AI agent from double-refunding.
- Add human approval before payment tools.
- Guard an agent that sends emails.
- Block data exfiltration from tool results.
- Cap token spend and tool-call loops per job.
- Closed-world agents for regulated workflows.
- Safe CRM write tools.
- MCP tool-call approvals.
- Audit logs for AI automations.
- When you need an agent versus a boring automation.

Tone:

- Show the bug.
- Show the guard.
- Show the deny/challenge result.
- Show the audit log.

## Near-Term Non-Goals

- Full product rename.
- Agent reputation.
- DID/VC as the top-level story.
- Broad enterprise governance dashboard.
- Multi-agent delegation as the primary wedge.
- Replacing IAM, OAuth, OPA, Cedar, OpenFGA, MCP authorization, or provider
  business rules.

## Naming

AgentPass remains the project and package family name.

Public positioning should use direct product language that explains the runtime
role clearly:

- runtime guard
- action gate
- tool-call guard
- circuit breaker
- approval gate
- data-flow gate

Names such as `AgentGuard` are semantically close, but the agent-security
namespace is crowded. A rename should only be considered if the current name
creates measurable confusion after the drop-in guard, data-flow controls,
provider trust gate, and core demos are documented and in use.
