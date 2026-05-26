# AgentID Gateway Control Demo

This Cloudflare Worker hosts a small gateway-control demo that calls the live
AgentID gateway through a Cloudflare Service Binding. It shows AgentID
authorizing both a SaaS refund workflow and an MCP provider-tool workflow before
tool execution. The browser never sees the gateway bearer token. For the
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
- MCP gateway tool filtering before provider tool exposure.
- MCP provider CRM read allow, write denial without JIT, and write allow after a
  scoped JIT grant.

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
