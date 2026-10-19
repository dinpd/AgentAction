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

## Shared authority across two providers

Open [the shared-authority experience](https://agentid-refund-demo.drisw.workers.dev/shared-authority),
also linked prominently from the original demo. Run **Refund $40. Close the case.**
and inspect the evidence and actual synthetic effects:

1. Acme explicitly delegates the fixture actions to AgentAction; both providers
   recognize the issuer only for Acme's named agent, principal and delegation.
2. The agent validates signed provider identities and fresh key-possession
   challenges against expected endpoints before sending customer payloads.
3. PaymentsCo verifies an ES256 exact-action grant, applies its own policy,
   consumes the grant once and returns signed execution evidence.
4. SupportCo accepts a different grant from the same issuer and verifies the
   matching payment execution receipt before closing case 1042.

Try the eight controls: change $40 to $400, replay the refund, send to the wrong
provider, substitute an impostor endpoint, revoke an unused grant, use an unknown
authority, dispatch after expiry, or lower PaymentsCo's own limit to $20.
Rejected payment attempts leave the case open and create zero effects. Replay
retains exactly the first $40 refund and can close the case using its verified
receipt. Impostor detection precedes all customer payload dispatch.

This is a self-contained synthetic extension of the existing refund Worker.
Both providers are separate in-process classes, not independently deployed
services or vendor integrations. Identity exchanges are local simulations;
trusted roots and Acme's delegation are provisioned fixtures. Every scenario
creates fresh ephemeral keys and isolated memory state. Reset/repeat starts a
new run; there is no durable cross-request revocation/replay guarantee. Provider
certificates and grants use a demo-only profile, not a public certification.
No gateway credentials, signing private keys, real payments, external provider
calls, personal data, or additional secrets are needed for this experience.

`POST /api/shared-authority/run` accepts only a JSON object with one `scenario`
field from the server's fixed scenario list, capped at 512 bytes. It returns
public trust metadata, grants, evidence and synthetic effect counts; it accepts
no destinations, grants, credentials, arbitrary tool arguments or script input.
The original gateway-backed demo routes remain available unchanged.

### Verify the demo

```bash
npm ci
npm test
npm run build
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
```

Browser acceptance starts a local bridge to the real Worker handlers and checks
every control at desktop/mobile widths, readable proofs, reset/repeat, request
failure recovery, no outbound provider traffic, and the original page link.
Use `DEMO_ORIGIN=http://localhost:8790` to run the same acceptance against a
running local Worker, or the hosted origin after deployment. Screenshots are
written to `/tmp/agentaction-388-browser` (override with `SCREENSHOT_DIR`).
The `Refund Demo` workflow verifies pull requests and deploys the existing
Worker on main only after those checks pass, using the existing Cloudflare
repository secrets.

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
