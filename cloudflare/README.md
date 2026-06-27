# AgentPass Cloudflare Gateway

This Worker exposes the AgentPass gateway API on Cloudflare Workers. It can sit
behind a SaaS app, internal agent platform, or MCP gateway and return
allow/deny/JIT decisions before tool execution:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check active manifest and tenant context |
| `GET /policy?target=opa` | Return generated OPA policy |
| `POST /authorize` | Authorize a proposed tool call |
| `POST /execution-results` | Record a completed provider result for idempotent replay |
| `POST /approval-requests` | Create a durable approval request |
| `GET /approval-requests?status=pending` | List the durable approval queue |
| `GET /approval-requests/<approval-id>` | Read approval status and bound context |
| `POST /approval-requests/<approval-id>/approve` | Approve an approval request |
| `POST /approval-requests/<approval-id>/deny` | Deny an approval request |
| `POST /jit-grants` | Issue a single-use JIT grant after approval checks |
| `POST /tenants/<tenant-id>/approval-requests` | Create a tenant-scoped approval request |
| `POST /tenants/<tenant-id>/authorize` | Authorize against a tenant manifest from KV |
| `POST /tenants/<tenant-id>/execution-results` | Record a tenant-scoped provider result for replay |
| `POST /tenants/<tenant-id>/jit-grants` | Issue a tenant-scoped JIT grant after approval checks |
| `GET /audit` | Open the audit console UI |
| `GET /approvals` | Open the approval and single-use execution console |
| `GET /audit/events` | Read recent audit events with optional filters |
| `POST /audit/webhook/agentid` | Receive AgentPass audit webhook events |

Approval requests, JIT grants, and idempotent execution results are stored in a
SQLite-backed Durable Object namespace. This keeps approval state, single-use
grant enforcement, and retry-safe result replay durable across Worker isolates.

## Local development

```bash
cd cloudflare
npm install
npm run dev
```

Then test the sample manifest:

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/authorize \
  -H 'content-type: application/json' \
  -d '{"agent_id":"customer-support-refund-agent","tool":"zendesk.search_tickets","action":"read","data_from":"zendesk","data_to":"stripe"}'
```

For approval-gated JIT tools, create and approve a request before issuing the
grant:

```bash
curl -s http://127.0.0.1:8787/approval-requests \
  -H 'content-type: application/json' \
  -d '{"approval_id":"approval-1","tool":"stripe.create_refund","action":"write","resource":"refund/re_123","requested_by":"user-1","reason":"approved refund"}'

curl -s http://127.0.0.1:8787/approval-requests/approval-1/approve \
  -H 'content-type: application/json' \
  -d '{"decided_by":"manager-1","decision_reason":"scope and evidence verified"}'

curl -s http://127.0.0.1:8787/jit-grants \
  -H 'content-type: application/json' \
  -d '{"approval_id":"approval-1","tool":"stripe.create_refund","action":"write","resource":"refund/re_123","user_id":"user-1","idempotency_key":"refund-1"}'

curl -s http://127.0.0.1:8787/authorize \
  -H 'content-type: application/json' \
  -d '{"agent_id":"customer-support-refund-agent","approval_id":"approval-1","jit_grant_id":"<grant-id>","tool":"stripe.create_refund","action":"write","resource":"refund/re_123","user_id":"user-1","approved":true,"idempotency_key":"refund-1"}'

curl -s http://127.0.0.1:8787/execution-results \
  -H 'content-type: application/json' \
  -d '{"agent_id":"customer-support-refund-agent","approval_id":"approval-1","jit_grant_id":"<grant-id>","tool":"stripe.create_refund","action":"write","resource":"refund/re_123","user_id":"user-1","idempotency_key":"refund-1","result":{"refund_id":"re_123"}}'
```

Approval requests require `resource`, `requested_by`, and `reason`. The gateway
adds an expiry and a versioned evidence object containing a canonical
`request_digest`. JIT issuance recomputes that digest and fails closed if the
resource, amount, destination, fields, or custom context changed after review.

Open `http://127.0.0.1:8787/approvals` to review the live queue. The console can
approve the exact scope, issue its JIT grant, authorize it once, record a
provider result, replay the cached result on identical retry, and display the
correlated audit timeline. Without credentials, the page remains usable as a
non-mutating preview.

For side-effectful tools, call `POST /execution-results` after the provider
confirms the mutation completed. The request uses the same action scope,
`jit_grant_id`, and `idempotency_key` as the allowed `/authorize` call and
includes a `result` object. Identical retries to `/authorize` then return the
cached result with `replayed: true`; changed scope under the same key is denied.

Hosted tool constraints can require operational context with
`constraints.required_context` and restrict values with
`constraints.allowed_values`. The production deploy test uses those fields to
require environment, service, repository, branch, commit SHA, and change request
context before a `devops.deploy.production` grant can execute.

For PII egress controls, include `data_from`, `data_to`, `destination_type`,
`external_domain`, `data_classification`, `field_set`, `record_count`,
`redaction_state`, and `retention` on `/authorize` and approval requests. Hosted
data-flow rules can deny blocked fields, enforce allowed domains and record
caps, require redacted or tokenized model-provider prompts, or return
`decision: "challenge_required"` when an otherwise allowed PII export needs
approval. The hosted test matrix covers email, webhook, browser-form,
model-provider, and file-export paths. Approved non-JIT calls with
`approval_id` are bound to the same `request_digest`, so changed domains or
fields are denied.

## Deploy

```bash
cd cloudflare
npm run deploy
```

Set an API key for production:

```bash
npx wrangler secret put AGENTID_API_KEY
```

The built-in audit console records authorization decisions, approval events,
and JIT grant events in the Durable Object store automatically. Optionally
configure audit export for an external sink. When `AGENTID_AUDIT_WEBHOOK_URL`
is set, the Worker emits the same events as JSON. `AGENTID_AUDIT_WEBHOOK_TOKEN`
is optional and is sent as a bearer token when present.

```bash
npx wrangler secret put AGENTID_AUDIT_WEBHOOK_URL
npx wrangler secret put AGENTID_AUDIT_WEBHOOK_TOKEN
```

The built-in audit webhook route is also available for external systems that
need to push AgentPass audit events into the console:

```text
https://<worker-host>/audit/webhook/agentid
```

Open the console at:

```text
https://<worker-host>/audit
```

The event API uses the same bearer token as the gateway API. The incoming
webhook route uses `AGENTID_AUDIT_WEBHOOK_TOKEN` when the gateway API key is
configured.

For the self-contained OIDC demo, set a shared demo signing secret on the
gateway and demo Worker:

```bash
npx wrangler secret put AGENTID_DEMO_OIDC_SECRET
```

For production OIDC, set each tenant manifest to `token_validation: jwks` with
the customer's `issuer`, `audiences`, and `jwks_uri`. The gateway validates
RS256 JWT signatures against the matching JWKS `kid`, then enforces issuer,
audience, tenant, agent, and scope checks from the manifest.

For a single-tenant deployment, set `AGENTID_MANIFEST_JSON` as a Worker variable.
For multi-tenant SaaS, internal platform, or MCP gateway deployments, bind a KV
namespace named `AGENTID_MANIFESTS` and store each tenant or environment
manifest as JSON under the ID used in `/tenants/<tenant-id>/...`.

## GitHub Actions

The repository includes `.github/workflows/cloudflare-gateway.yml`. Add these
repository secrets before using it:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
