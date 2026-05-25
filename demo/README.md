# AgentID Refund Demo

This Cloudflare Worker hosts a small SaaS runtime demo that calls the live
AgentID gateway through a Cloudflare Service Binding. The browser never sees the
gateway bearer token.

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
npx wrangler secret put AGENTID_GATEWAY_TOKEN
```

The deployed Worker uses `AGENTID_GATEWAY` as a Service Binding to call the
`agentid-gateway` Worker without exposing the gateway token in frontend code.
