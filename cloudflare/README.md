# AgentID Cloudflare Gateway

This Worker exposes the AgentID gateway API on Cloudflare Workers:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check active manifest and tenant context |
| `GET /policy?target=opa` | Return generated OPA policy |
| `POST /authorize` | Authorize a proposed tool call |
| `POST /jit-grants` | Issue a single-use JIT grant |
| `POST /tenants/<tenant-id>/authorize` | Authorize against a tenant manifest from KV |
| `POST /tenants/<tenant-id>/jit-grants` | Issue a tenant-scoped JIT grant |

JIT grants are stored in a SQLite-backed Durable Object namespace. This keeps
single-use grant enforcement durable across Worker isolates.

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
For SaaS multi-tenancy, bind a KV namespace named `AGENTID_MANIFESTS` and store
each tenant manifest as JSON under the tenant ID used in `/tenants/<tenant-id>/...`.

## GitHub Actions

The repository includes `.github/workflows/cloudflare-gateway.yml`. Add these
repository secrets before using it:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
