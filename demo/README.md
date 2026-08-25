# AgentAction Gateway Control Demo

This Cloudflare Worker hosts a small gateway-control demo that calls the live
AgentAction gateway through a Cloudflare Service Binding. It shows AgentAction
authorizing a SaaS refund workflow, a skill-orchestrated tool workflow, and an
MCP provider-tool workflow before tool execution. The browser never sees the
gateway bearer token. For the
self-contained demo, the Worker mints a short-lived HS256-signed OIDC-style JWT
and the gateway validates it against the tenant manifest.

Live demo:

https://agentid-refund-demo.drisw.workers.dev

The demo illustrates:

- Support context lookup before action.
- Customer refund-history lookup before any refund.
- One-month refund with clean history.
- One-month refund with prior refund history requiring human notification.
- Three-month refund after customer escalation requiring human notification.
- JIT grant issuance before Stripe refund execution.
- Single-use JIT grant consumption by the gateway.
- Skill-carried AgentAction guardrail review before activation.
- Skill activation through JIT authority.
- Skill denial when it tries to call a downstream tool outside `may_invoke`.
- Skill-originated provider credit allow after downstream JIT and approval.
- MCP gateway tool filtering before provider tool exposure.
- MCP provider CRM read allow, write denial without JIT, and write allow after a
  scoped JIT grant.
- Enterprise-managed MCP auth with JWT validation, real AgentAction gateway
  approval/JIT/authorization, signed provider receipt forwarding, and
  provider-side receipt verification before execution.
- Provider denial when a receipt is validly signed but its enterprise client
  binding no longer matches the provider trust policy.

The skill demo expects the provider-MCP tenant manifest to include the
`support-refund-workflow` capability from
`examples/provider-mcp-support-agent.yaml`.

## Local development

```bash
cd demo
npm install
npm run dev
```

## Deploy

```bash
cd demo
npm run deploy
```

Required secret:

```bash
npx wrangler secret put AGENTID_DEMO_OIDC_SECRET
```

The deployed Worker uses `AGENTID_GATEWAY` as a Service Binding to call the
`agentid-gateway` Worker without exposing credentials in frontend code. For a
production IdP, replace demo HS256 validation with JWKS validation from the
customer OIDC issuer.
