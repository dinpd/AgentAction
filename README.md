# AgentPass

**Runtime authorization for AI agent tool calls.**

AgentPass is a runtime action gate that sits before agents call tools, send
messages, move money, update records, deploy code, export data, or touch
sensitive systems.

```text
Agent proposes tool call -> AgentPass checks policy -> allow / deny / challenge
```

AgentPass helps builders ship bounded AI automations and agents without giving
models unchecked execution authority over production systems, customer data,
payments, external sends, secrets, and administrative tools.

AgentPass answers one runtime question:

> Should this agent perform this capability or tool action on this resource, for this user, job, customer, approval, and time window?

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
- Demo: [`packages/guard/examples/support-refund-demo.ts`](packages/guard/examples/support-refund-demo.ts)
- Circuit-breaker demo: [`packages/guard/examples/circuit-breaker-demo.ts`](packages/guard/examples/circuit-breaker-demo.ts)
- Drop-in tool gate: [`packages/guard/examples/tool-gate-demo.ts`](packages/guard/examples/tool-gate-demo.ts)
- Starter policies: [`packages/guard/policies/`](packages/guard/policies/)

The guard package is a prototype in this repo today, not a published npm
package yet. The goal is to validate the policy shape and integration API before
shipping registry packages and framework adapters.

OAuth can prove access to a server. MCP tool schemas describe inputs. Agent
frameworks can decide which tools are visible to a model. AgentPass focuses on
the runtime decision immediately before a tool executes.

The core idea is simple:

> Every production agent should have a runtime action contract that says what it
> can request, what must be challenged, where sensitive data can flow, which
> retries are safe, and how execution should be stopped.

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
- Provider MCP authorization: [`docs/provider-mcp-authorization.md`](docs/provider-mcp-authorization.md)
- Receipt profiles: [`docs/receipt-profiles.md`](docs/receipt-profiles.md)

---

## Quick Start

Try the first developer wedge: add a circuit breaker and approval gate before
your agent executes tools.

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
import { createToolGate } from "@dinpd/guard";

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

## Feedback Wanted

This package is intentionally local-first. Before adding hosted gateways or
account infrastructure, the next useful feedback is:

- Which failure mode matters most in your agents: token spend, tool loops,
  duplicate side effects, PII exfiltration, shell/browser actions, or something
  else?
- Does `allow` / `deny` / `challenge_required` fit how your agent runtime
  handles tool calls?
- What fields are missing from the guard check: tenant, customer, workspace,
  channel, model, tool params, MCP server, approval source, or policy version?
- Which adapter should come first: OpenClaw, OpenAI Agents SDK, LangGraph,
  CrewAI, AutoGen, MCP gateway, or plain Express/FastAPI middleware?
- Would you rather run this as an in-process package, a local sidecar, or a
  hosted policy service?

## Broader Governance Scope

The same action-gate model can move from an in-process guard to shared
boundaries such as app runtimes, MCP gateways, provider MCP servers, and
security-controlled policy services.

For enterprise governance, gateway, provider-contract, receipt, and standards
documentation, see [Enterprise Governance](docs/enterprise-governance.md).

For the runtime guard roadmap, see [Action Gate Roadmap](docs/action-gate-roadmap.md).

---

## License

Apache-2.0
