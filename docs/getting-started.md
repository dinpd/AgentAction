# Getting Started with AgentPass

This walkthrough shows how to use AgentPass as an authorization contract for AI
agent tool calls across app runtimes, internal systems, SaaS APIs, and MCP
gateways.

## Before You Start

AgentPass works best when the provider publishes tool authorization requirements
and the enterprise overlays local policy. The provider knows what each tool can
do; the enterprise knows which agents, users, jobs, customers, and approval
workflows are allowed.

For runtime integration patterns, see
[`integration-patterns.md`](integration-patterns.md) and
[`mcp-gateway-integration.md`](mcp-gateway-integration.md).

## 1. Install

```bash
git clone https://github.com/dinpd/AgentPass.git
cd AgentPass
python -m pip install -e ".[dev]"
```

## 2. Validate a Manifest

Start with the included provider MCP support manifest:

```bash
agentid validate examples/provider-mcp-support-agent.yaml
agentid explain examples/provider-mcp-support-agent.yaml
agentid risk-score examples/provider-mcp-support-agent.yaml
```

The manifest declares:

- Agent identity, owner, purpose, and expiry.
- OIDC issuer, audiences, claim mappings, and required scopes.
- Tools the agent may request.
- Which tools require JIT authority and approval.
- Allowed and blocked data flows.
- Runtime, audit, and kill-switch expectations.

## 3. Use JSON Schema in Your Editor

AgentPass ships a JSON Schema:

```bash
agentid schema > schema/agentid.schema.json
```

Add this to your manifest for editor validation:

```yaml
$schema: https://raw.githubusercontent.com/dinpd/AgentPass/main/schema/agentid.schema.json
```

## 4. Generate Starter Policy

Generate starter OPA/Rego policy from a manifest:

```bash
agentid generate-policy examples/provider-mcp-support-agent.yaml --target opa
```

The manifest remains the portable source of truth. OPA is one target runtime
format for teams that already use Open Policy Agent.

## 5. Try the Config UI

Generate the browser-based policy builder:

```bash
agentid config-ui --output agentid-policy-builder.html
```

Or use the hosted version:

https://agentid-policy-builder.pages.dev

The builder produces manifest YAML, starter OPA policy, and example gateway
requests.

## 6. Run the Gateway Locally

```bash
agentid gateway examples/provider-mcp-support-agent.yaml --host 127.0.0.1 --port 8787
```

Then authorize a tool call:

```bash
curl -s http://127.0.0.1:8787/authorize \
  -H 'content-type: application/json' \
  -d '{
    "agent_id": "enterprise-support-agent",
    "job_id": "support_case_resolution",
    "case_id": "case-1042",
    "customer_id": "cus_123",
    "tool": "provider.crm.search_customer",
    "action": "read",
    "resource": "provider/customer/cus_123",
    "data_from": "provider_crm",
    "data_to": "agent_context"
  }'
```

For production, prefer the Cloudflare gateway or your own gateway integration
with OIDC/JWKS validation.

## 7. Add PR Checks

Use the AgentPass GitHub Action in your own repo:

```yaml
name: AgentPass Check

on: [pull_request]

jobs:
  agentpass:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dinpd/AgentPass@main
        with:
          manifests: "agents/*.yaml"
          max-risk: "75"
```

This validates manifests, emits PR warnings/errors, computes risk scores, and
fails if risk exceeds the threshold.

## 8. Call the Gateway from TypeScript

Use the helper in `sdk/typescript`:

```ts
import { AgentIdClient } from "@agentid/client";

const agentid = new AgentIdClient({
  baseUrl: "https://agentid-gateway.example.com",
  token: async () => getAccessTokenFromYourIdP(),
});

await agentid.assertAllowed("tenant-a", {
  agent_id: "enterprise-support-agent",
  job_id: "support_case_resolution",
  case_id: "case-1042",
  customer_id: "cus_123",
  tool: "provider.crm.search_customer",
  action: "read",
  resource: "provider/customer/cus_123",
  data_from: "provider_crm",
  data_to: "agent_context",
});
```

For sensitive actions, request a JIT grant before executing the tool:

```ts
const grant = await agentid.requestJitGrant("tenant-a", {
  tool: "provider.crm.update_customer",
  action: "write",
  resource: "provider/customer/cus_123",
  job_id: "support_case_resolution",
  case_id: "case-1042",
  customer_id: "cus_123",
  approval_id: "approval-123",
  user_id: "support-rep-17",
});

await agentid.assertAllowed("tenant-a", {
  agent_id: "enterprise-support-agent",
  tool: "provider.crm.update_customer",
  action: "write",
  resource: "provider/customer/cus_123",
  job_id: "support_case_resolution",
  case_id: "case-1042",
  customer_id: "cus_123",
  approved: true,
  jit_grant_id: grant.jit_grant_id,
});
```

## 9. Deploy on Cloudflare

The `cloudflare/` directory contains a Workers gateway with:

- Tenant manifests in KV.
- Approval requests and single-use JIT grants in Durable Objects.
- Static API-key bootstrap support.
- Demo HS256 JWT support.
- Production RS256/JWKS validation path.

```bash
cd cloudflare
npm install
npm run deploy
```

See [`cloudflare/README.md`](../cloudflare/README.md) for details.

## 10. Try the Hosted Gateway Demo

The hosted demo shows a SaaS support app and MCP gateway consulting AgentPass
before tool execution:

https://agentid-refund-demo.drisw.workers.dev

It illustrates:

- Support context lookup.
- Customer refund-history lookup before any refund.
- Human notification for repeat-refund or multi-month refund scenarios.
- JIT grant issuance before Stripe refund execution.
- Skill guardrail review, activation, downstream denial, and approved provider
  credit execution.
- MCP provider tool filtering, read authorization, write denial without JIT, and
  write authorization after a scoped grant.
- Gateway decisions with OIDC-derived auth context.

## Next Steps

- Replace the sample manifest with one for your agent.
- Add OIDC issuer, audience, JWKS URI, and claim mappings for your IdP.
- Put `assertAllowed` before every tool execution.
- Use JIT grants for write, execute, admin, financial, external-send, and data-change actions.
- Add the GitHub Action to enforce manifest review in pull requests.
