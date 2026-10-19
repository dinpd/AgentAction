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

## Shared authority across independently deployed providers

Open [the shared-authority experience](https://agentid-refund-demo.drisw.workers.dev/shared-authority),
also linked from the original demo. Run **Refund $40. Close the case.** and
inspect grants, execution evidence and signed provider effect snapshots.

The deployment contains four separate Workers:

| Service | Responsibility | Private key custody |
| --- | --- | --- |
| Existing refund Worker | Agent orchestration, fixed scenario controls and UI | No authority or provider signing keys |
| [AgentAction authority](https://agentaction-demo-authority.drisw.workers.dev/.well-known/jwks.json) | Exact-action grants, fixed Acme delegation, provider identity certification and revocation | Its own durable authority namespace |
| [PaymentsCo](https://agentaction-demo-payments.drisw.workers.dev/health) | Refund verification, provider policy and synthetic execution | Its own durable provider namespace |
| [SupportCo](https://agentaction-demo-support.drisw.workers.dev/health) | Case update verification and matching payment evidence | Its own durable provider namespace |

Both providers fetch public trust material and revocation state through fixed,
role-specific authority service bindings. They independently verify the same
ES256 grant profile against the same authority key. Grants bind distinct provider
audiences and every action argument. SupportCo accepts PaymentsCo execution
evidence only after verifying the root-signed payment identity and payment
signature. No provider receives another service's private key.

Provider identity/key-possession challenges cross actual service boundaries.
The frontend uses HTTP service bindings for provider calls and an RPC issuance
capability for the authority. Public provider `/mcp` endpoints also verify grants
directly. Destinations and trust sources are fixed deployment configuration;
caller-supplied URLs, public keys and arbitrary policy controls are not accepted.

### Controls, evidence and state

All eight controls remain: change $40 to $400, replay, wrong recipient, impostor
endpoint, revoke before dispatch, unknown authority, expired grant, and lower
provider limit. Each rejection comes from the relevant service's actual checks.
The impostor fixture substitutes the expected endpoint while challenging a real
provider; it stops customer dispatch. The expired-grant fixture is signed with an
already-expired lifetime; providers use their real clocks.

Each provider serializes operations and commits consumption plus synthetic
effects in one durable write. Concurrent replay cannot create a second refund.
State and signing keys survive process restarts. Nonce-bound signed snapshots
report the provider's own counts and the authority-key fingerprint; the UI does
not infer effects from an authorization decision.

Issuance, enrollment and revocation are service-only RPC capabilities, not
public HTTP routes. Each provider's enrollment capability binds its fixed role.
A run permits one immutable payment grant and one immutable support grant.
Public clients cannot reset state, replace keys or change provider policy.
The authority limits the demo to 1,000 active ten-minute runs and prunes expired
metadata. Grants and identity certificates last at most five minutes. Provider
records are scheduled for deletion after one hour; expired/unknown runs cannot
be reinitialized with old grants. Reset starts a new synthetic run and does not
erase or undo an existing provider record.

Unavailable services, unverifiable results or lost responses stop the workflow.
The UI displays **Unknown**, not zero or success. When the server can identify
the run, an error response includes the run ID and fixed provider-state query
URLs for review. A lost browser response may also lose that identifier; there
is no automatic execution retry or claim of general recovery guarantees.

This is separate-service verification under one demo operator using a shared
experimental verifier profile and provisioned trust. It is not independent-vendor
adoption, a public certification, or real financial execution. The original
gateway-backed routes are unchanged. No additional secrets or live provider
credentials are needed.

### Local verification and development

```bash
npm ci
npm test
npm run build
npm run test:services
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
npm run dev:shared
```

Service acceptance starts four separate Wrangler processes on distinct local
ports, each with isolated persistent state. It verifies public endpoints,
the shared authority, separate signing keys, all controls, direct grant checks,
12 concurrent calls, persisted state/key/replay behavior across restarts, denied
public administration routes and fail-closed outages. Browser acceptance uses
the same real service stack at desktop/mobile widths, including Unknown on
request failure. Screenshots default to `/tmp/agentaction-390-browser`.

`npm run dev:shared` prints the local frontend and service URLs. The original
`npm run dev` starts only the gateway-backed frontend; the shared-authority flow
fails closed if its independent services are not running.

The `Refund Demo` workflow validates pull requests, then on main deploys the
authority, both providers and finally the existing frontend in dependency order
using existing Cloudflare repository secrets. It runs hosted service acceptance
after deployment. Use `npm run deploy:services` for the same deployment sequence.

To test the actual hosted services:

```bash
DEMO_ORIGIN=https://agentid-refund-demo.drisw.workers.dev npm run test:services
DEMO_ORIGIN=https://agentid-refund-demo.drisw.workers.dev PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
```

`POST /api/shared-authority/run` still accepts only a fixed scenario in a JSON
object capped at 512 bytes. Provider `/mcp` requests are capped at 24 KB and
accept only a run, grant, exact action, nonce, and optional signed payment
receipt/certificate. Authority HTTP exposes health and public keys only.

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
