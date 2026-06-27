# AgentPass

**Stateful guardrails around AI agent tool calls.**

AgentPass is a runtime gate that sits outside the agent loop and checks tool
calls before execution.

```text
Agent proposes tool call -> AgentPass checks policy + state -> allow / deny / challenge
```

RBAC can say which identity may access a tool. Prompts can suggest how an agent
should behave. AgentPass answers the runtime execution question:

> Should this specific tool call, with this payload, in this job state, execute right now?

AgentPass is designed for failures that static access control and prompt rules
do not catch:

- Duplicate side effects, such as repeated refunds, emails, exports, or writes.
- Runaway tool loops and repeated calls.
- Token, cost, runtime, and tool-call budget spikes.
- PII or sensitive data flowing to the wrong destination.
- Risky actions that need single-action approval.
- Missing decision logs when something goes wrong.

The gate should run outside the model context and outside agent-editable memory.
If the agent can rewrite the rule, grant its own approval, or erase prior state,
it is not a real guardrail.

AgentPass is one control model with different entry points depending on where
you sit in the agent stack:

- **Agent developers** start with the local TypeScript guard to wrap tool calls
  in an existing agent loop.
- **Enterprise AI and platform teams** use manifests, approvals, gateways,
  policy checks, and audit to govern agents across systems.
- **MCP gateway builders** enforce AgentPass before forwarding `tools/call`.
- **API and SaaS providers** publish provider contracts and verify scoped
  receipts before executing agent-originated actions.
- **Security and risk teams** review action policy, PII/data-flow controls,
  decision events, JIT grants, and kill-switch behavior.

The first package is the local TypeScript guard:

- Package: [`packages/guard/`](packages/guard/)
- Quickstart demo: [`packages/guard/examples/quickstart-agent-loop.ts`](packages/guard/examples/quickstart-agent-loop.ts)
- MCP tool-call demo: [`packages/guard/examples/mcp-tool-call-demo.ts`](packages/guard/examples/mcp-tool-call-demo.ts)
- MCP gateway/interceptor adapter: [`mcp-gateway-adapter/`](mcp-gateway-adapter/)
- Demo: [`packages/guard/examples/support-refund-demo.ts`](packages/guard/examples/support-refund-demo.ts)
- Circuit-breaker demo: [`packages/guard/examples/circuit-breaker-demo.ts`](packages/guard/examples/circuit-breaker-demo.ts)
- Drop-in tool gate: [`packages/guard/examples/tool-gate-demo.ts`](packages/guard/examples/tool-gate-demo.ts)
- Starter policies: [`packages/guard/policies/`](packages/guard/policies/)

The guard package is published on npm as
[`@dinpd/ai-agent-guard`](https://www.npmjs.com/package/@dinpd/ai-agent-guard).
The repo also includes local demos, starter policies, and the MCP tool-call
adapter so developers can validate the policy shape inside an existing agent
loop before adding broader gateway or enterprise enforcement.

OAuth can prove access to a server. MCP tool schemas describe inputs. Agent
frameworks can decide which tools are visible to a model. AgentPass focuses on
the runtime decision immediately before a tool executes.

## Why A Stateful Gate

Stateless checks can catch obvious policy violations: blocked tools, unsafe
destinations, amount caps, and PII fields.

Many agent failures are stateful:

- The same refund was already issued.
- The same email was already sent.
- The same tool call keeps repeating.
- The job has crossed a token, cost, runtime, or tool-call budget.
- An approval was granted for one action, not an open-ended session.
- A prior denial should stop the job before it keeps trying.

That state has to live in the execution boundary, not in the agent's prompt or
scratchpad. The agent can remember what it thinks happened. The gate remembers
what actually executed.

For side-effectful tools, AgentPass treats idempotency as part of the runtime
boundary. A refund, payment, email, export, or production write should carry an
idempotency key or call fingerprint that the gate can remember outside the agent
loop.

Approvals should be scoped to one proposed action: tool, resource, payload hash,
amount, destination, job, and expiry. If any of those change, the agent needs a
new approval.

When every risky action passes through the same gate, audit is not bolted on
afterward. The gate log becomes the record of what was proposed, allowed,
denied, challenged, and why.

For concrete ecommerce and SRE examples, including the authorization context
the runtime must supply and the evidence left after execution, see
[`Authorization in Practice`](docs/authorization-in-practice.md).

## Explainer Video

https://github.com/user-attachments/assets/4d5757f7-ffa0-4c0f-a5bc-1bde4336703a

AgentPass does **not** replace IAM, OAuth, MCP gateways, OPA, Cedar, or
enterprise security tools. It gives agent runtimes a small policy checkpoint for
tool calls, approvals, data movement, circuit breakers, and audit events.

## Core Concepts

AgentPass separates three concepts that are often blurred in agent systems:

```text
Skill = workflow package
Tool = executable operation
Flow = data movement boundary
```

- **Tool:** an operation the agent or runtime can call, such as
  `provider.crm.search_customer`, `stripe.create_refund`, or
  `email.send_external`. Tool policy answers what operation is being attempted,
  what access level it has, which resource it affects, and whether approval is
  required.
- **Skill:** a reusable workflow package that may call one or more tools, such
  as `support-refund-workflow`. Skill policy becomes relevant when reusable
  workflows need explicit downstream tool limits.
- **Flow:** a source-to-destination data boundary, such as
  `provider_crm -> agent_context` or `customer_records -> external_email`.
  Flow policy answers where data may move and which destinations are blocked.

The local guard implements tool and flow checks first. Larger deployments can
apply the same policy model through manifests, signed receipts, hosted gateways,
and provider-side verification.

## Entry Points By Audience

- **Platform engineering and SRE teams** letting agents inspect systems while
  gating production deploys, rollbacks, Terraform applies, Kubernetes changes,
  incident remediation, secrets, and IAM changes.
- **Enterprise AI platform teams** reviewing which tools agents may use, under
  what conditions.
- **Security teams** needing approval, audit, and kill-switch evidence for
  high-risk agent actions.
- **MCP gateway builders** enforcing policy before forwarding `tools/call`.
- **API and SaaS providers** turning APIs into MCP tools without giving agents
  broad authority.
- **API platform and monetization teams** preserving entitlements, quotas,
  metering, and billing controls as APIs become agent-callable tools.
- **Skill authors and platform teams** packaging reusable workflows with
  explicit AgentPass guardrails.

For gateway deployments, AgentPass can run at an enterprise-controlled boundary
as the authorization decision service, not necessarily as the network gateway or
MCP proxy:

```text
Enterprise Agent -> Enterprise Gateway or App Runtime -> AgentPass Check -> Internal, SaaS, or MCP Tool
```

The MCP gateway adapter can also embed the local guard for a self-contained
demo. That path keeps job state in the gateway process and proves the call-time
behavior people expect from a gateway or interceptor: allow a safe call, deny a
duplicate side effect, stop a looping job, and block PII egress before
forwarding `tools/call`.

If you are an agent developer:

- TypeScript guard package: [`packages/guard/`](packages/guard/)
- Support/refund demo policy: [`packages/guard/examples/support-refund-policy.json`](packages/guard/examples/support-refund-policy.json)
- Circuit-breaker demo: [`packages/guard/examples/circuit-breaker-demo.ts`](packages/guard/examples/circuit-breaker-demo.ts)
- Drop-in tool-gate demo: [`packages/guard/examples/tool-gate-demo.ts`](packages/guard/examples/tool-gate-demo.ts)
- Roadmap: [`docs/action-gate-roadmap.md`](docs/action-gate-roadmap.md)

If you are evaluating enterprise governance, gateway enforcement, provider
contracts, receipts, or standards alignment:

- Enterprise governance: [`docs/enterprise-governance.md`](docs/enterprise-governance.md)
- MCP gateway integration: [`docs/mcp-gateway-integration.md`](docs/mcp-gateway-integration.md)
- MCP interceptor/PDP shape: [`docs/mcp-interceptor-pdp-shape.md`](docs/mcp-interceptor-pdp-shape.md)
- Provider MCP authorization: [`docs/provider-mcp-authorization.md`](docs/provider-mcp-authorization.md)
- Receipt profiles: [`docs/receipt-profiles.md`](docs/receipt-profiles.md)

---

## Quick Start

Try the first developer wedge: add a circuit breaker and approval gate before
your agent executes tools.

Install the package:

```bash
npm install @dinpd/ai-agent-guard
```

Run the local demos:

```bash
git clone https://github.com/dinpd/AgentPass.git
cd AgentPass/packages/guard
npm install
npm run demo:quickstart
npm run demo:mcp
npm test
npm run demo:circuit
npm run demo:gate
npm run demo:pii
```

Use it in an agent loop:

```ts
import { createToolGate } from "@dinpd/ai-agent-guard";

const gate = createToolGate({ policy });

const execution = await gate.run(
  {
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 49,
    idempotencyKey: "refund-case-1042-pi_123"
  },
  () => stripe.refunds.create({ payment_intent: "pi_123", amount: 4900 })
);

if (!execution.executed) {
  return execution.decision;
}
```

The guard currently demonstrates:

- Circuit breakers for runaway tool calls, repeated calls, token spend, cost,
  and runtime.
- Action controls for approvals, amount caps, and single-use idempotency.
- PII/data-flow controls for approved destinations, blocked fields, record
  counts, and model-provider prompts.
- Audit events for every allow, deny, or challenge decision.

Starter policies:

- [`tool-spend-cap.json`](packages/guard/policies/tool-spend-cap.json) for tool
  loops, retries, tokens, runtime, and estimated cost caps.
- [`pii-egress.json`](packages/guard/policies/pii-egress.json) for PII movement
  and blocked fields.
- [`refund-payment.json`](packages/guard/policies/refund-payment.json) for
  refunds, amount caps, idempotency, and single-use actions.
- [`shell-browser-guard.json`](packages/guard/policies/shell-browser-guard.json)
  for shell, file, browser, and secret-flow guardrails.
- [`mcp-tool-gateway.json`](packages/guard/policies/mcp-tool-gateway.json) for
  MCP-style provider tools.

Enterprise manifest and provider-contract tooling is available when you need a
reviewable governance layer beyond the local guard package:

```bash
git clone https://github.com/dinpd/AgentPass.git
cd AgentPass
python -m pip install -e ".[dev]"
agentpass validate examples/provider-mcp-support-agent.yaml
agentpass risk-score examples/provider-mcp-support-agent.yaml
agentpass generate-policy examples/provider-mcp-support-agent.yaml --target opa
```

AgentPass installs `agentpass` as the primary CLI and keeps `agentid` as a
compatibility command alias. The Python package, schema filenames, environment
variables, and receipt field names still use `agentid` for compatibility.

## Current Status

AgentPass currently includes:

- Published local TypeScript guard: `@dinpd/ai-agent-guard`
- Tool-call and MCP `tools/call` wrappers
- Starter policies for spend caps, PII egress, refunds/payments,
  shell/browser tools, and MCP gateways
- Local idempotency result replay for retry-safe side-effect execution
- Runnable demos for refunds, circuit breakers, MCP calls, direct tool gates,
  and PII flows
- Cloudflare gateway runtime for approvals, JIT grants, tenant manifests, OIDC
  checks, and audit events
- Hosted idempotency result replay for retry-safe side-effect execution
- Hosted PII egress controls for email, webhook, browser-form,
  model-provider, and file-export paths with exact field and destination
  binding
- Hosted production deploy and rollback gate checks required environment,
  repository, branch, commit, change-request, incident, rollback-plan, and
  workflow context, then dispatches GitHub Actions with retry-safe provider
  result replay
- Hosted approval inbox for evidence review, scoped JIT issuance, one-time
  authorization, replay testing, and correlated audit timelines
- Provider-side Express and FastAPI middleware

## Roadmap Focus

Near-term work is ordered by the next end-to-end behavior a user can see and
reproduce:

1. Provider trust enforcement with production receipts and contract drift
   detection.
2. Framework and workflow wrappers selected from adopter demand.

The [Action Gate Roadmap](docs/action-gate-roadmap.md) is the source of truth
for priority and maps each demonstration to its GitHub implementation issues.

## Broader Governance Scope

The same action-gate model can move from an in-process guard to shared
boundaries such as app runtimes, MCP gateways, provider MCP servers, and
security-controlled policy services.

For enterprise governance, gateway, provider-contract, receipt, and standards
documentation, see [Enterprise Governance](docs/enterprise-governance.md).

## Open Source Governance

- [Contributing](CONTRIBUTING.md): development setup, review expectations, and
  pull request checklist.
- [Governance](GOVERNANCE.md): project scope, roles, decision making, and
  security-sensitive change rules.
- [Security Policy](SECURITY.md): private vulnerability reporting and response
  process.
- [Code of Conduct](CODE_OF_CONDUCT.md): community behavior expectations and
  enforcement.
- [Support](SUPPORT.md): where to ask questions and what to include.
- [Maintainers](MAINTAINERS.md): current maintainers and review areas.

---

## License

Apache-2.0
