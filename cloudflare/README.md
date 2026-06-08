# AgentID Cloudflare Gateway

This Worker exposes the AgentID gateway API on Cloudflare Workers. It can sit
behind a SaaS app, internal agent platform, or MCP gateway and return
allow/deny/JIT decisions before tool execution:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check active manifest and tenant context |
| `GET /policy?target=opa` | Return generated OPA policy |
| `POST /authorize` | Authorize a proposed tool call |
| `POST /approval-requests` | Create a durable approval request |
| `GET /approval-requests/<approval-id>` | Read approval status and bound context |
| `POST /approval-requests/<approval-id>/approve` | Approve an approval request |
| `POST /approval-requests/<approval-id>/deny` | Deny an approval request |
| `POST /jit-grants` | Issue a single-use JIT grant after approval checks |
| `POST /tenants/<tenant-id>/approval-requests` | Create a tenant-scoped approval request |
| `POST /tenants/<tenant-id>/authorize` | Authorize against a tenant manifest from KV |
| `POST /tenants/<tenant-id>/jit-grants` | Issue a tenant-scoped JIT grant after approval checks |

Approval requests and JIT grants are stored in a SQLite-backed Durable Object
namespace. This keeps approval state and single-use grant enforcement durable
across Worker isolates.

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
  -d '{"decided_by":"manager-1"}'

curl -s http://127.0.0.1:8787/jit-grants \
  -H 'content-type: application/json' \
  -d '{"approval_id":"approval-1","tool":"stripe.create_refund","action":"write","resource":"refund/re_123","user_id":"user-1"}'
```

## Deploy

```bash
cd cloudflare
npm run deploy
```

Set an API key for production:

```bash
npx wrangler secret put AGENTID_API_KEY
```

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
