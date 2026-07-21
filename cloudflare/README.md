# AgentPass Cloudflare Gateway

This Worker exposes the AgentPass gateway API on Cloudflare Workers. It can sit
behind a SaaS app, internal agent platform, or MCP gateway and return
allow/deny/JIT decisions before tool execution:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check active manifest and tenant context |
| `GET /.well-known/jwks.json` | Publish public keys for hosted provider authorization receipt verification |
| `GET /jwks` | Alias for the hosted provider authorization receipt JWKS |
| `GET /policy?target=opa` | Return generated OPA policy |
| `POST /authorize` | Authorize a proposed tool call |
| `POST /execution-results` | Record a completed provider result for idempotent replay |
| `POST /intent-contracts` | Register and freeze an intent contract with its canonical digest |
| `GET /intent-contracts` | List registered intent contracts |
| `GET /intent-contracts/<intent-id>` | Read a registered contract and lifecycle status |
| `POST /intent-contracts/<intent-id>/observations` | Record a provider or application observation bound to the contract |
| `POST /intent-contracts/<intent-id>/evaluate` | Emit a non-finalizing preview evaluation |
| `POST /intent-contracts/<intent-id>/finalize` | Atomically freeze evidence and emit the one final snapshot-bound receipt |
| `GET /intent-contracts/<intent-id>/evaluations` | Read evaluation history, latest preview, final receipt, and evidence snapshot |
| `POST /github-actions/dispatch` | Authorize and dispatch a scoped GitHub Actions workflow, then record the provider result |
| `POST /approval-requests` | Create a durable approval request |
| `GET /approval-requests?status=pending` | List the durable approval queue |
| `GET /approval-requests/<approval-id>` | Read approval status and bound context |
| `POST /approval-requests/<approval-id>/approve` | Approve an approval request |
| `POST /approval-requests/<approval-id>/deny` | Deny an approval request |
| `POST /jit-grants` | Issue a single-use JIT grant after approval checks |
| `POST /tenants/<tenant-id>/approval-requests` | Create a tenant-scoped approval request |
| `POST /tenants/<tenant-id>/authorize` | Authorize against a tenant manifest from KV |
| `POST /tenants/<tenant-id>/execution-results` | Record a tenant-scoped provider result for replay |
| `POST /tenants/<tenant-id>/github-actions/dispatch` | Dispatch a tenant-scoped GitHub Actions workflow after authorization |
| `POST /tenants/<tenant-id>/jit-grants` | Issue a tenant-scoped JIT grant after approval checks |
| `GET /audit` | Open the audit console UI |
| `GET /approvals` | Open the approval and single-use execution console |
| `GET /audit/events` | Read recent audit events with optional filters |
| `POST /audit/webhook/agentid` | Receive AgentPass audit webhook events |

Approval requests, JIT grants, and idempotent execution results are stored in a
SQLite-backed Durable Object namespace. This keeps approval state, single-use
grant enforcement, and retry-safe result replay durable across Worker isolates.
Intent contracts, bound decision events, execution receipts, observations, job
evidence, and evaluation receipts use the same tenant-scoped durable store. All
API routes in the table can be prefixed with `/tenants/<tenant-id>`.

## Hosted intent trust gate

Register a contract before submitting intent-bound work:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-contracts \
  -H 'content-type: application/json' \
  -d @intent-contract.json
```

Registration calculates the canonical `intent_digest` and freezes the first
contract stored for an `intent_id`. Re-registering identical contents is
idempotent; changed contents return `409`. Runtime requests remain backward
compatible when both intent fields are absent. Once either `intent_id` or
`intent_digest` is present, the gateway requires both and rejects unknown,
altered, not-yet-active, expired, or job-mismatched contracts before normal
tool authorization.

Allowed and denied authorization decisions are recorded as intent evidence.
`POST /execution-results` adds the provider execution receipt. Provider and
application observations are accepted only from an issuer trusted by the
tenant's `intent_assurance.observations` policy. Trust can be scoped to intent
profiles and predicates and bound either to the caller's OIDC issuer/subject or
to an RS256 JWS verified against the issuer's JWKS.

An OIDC-authenticated adapter can submit direct JSON. Timestamps must be fresh
under the tenant policy:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-contracts/refund-case-1042/observations \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <provider-oidc-token>' \
  -d '{"schema_version":"agentpass.intent-observation.v1","observation_id":"obs-refund-1042","tenant_id":"acme","intent_id":"refund-case-1042","intent_digest":"<registered-intent-digest>","predicate":"refund.status","value":"succeeded","observed_at":"<current-ISO-timestamp>","issued_at":"<current-ISO-timestamp>","expires_at":"<short-lived-ISO-timestamp>","issuer":"stripe-adapter"}'
```

For a signed envelope, post `{ "jws": "<compact-RS256-JWS>" }`. The JWS claims
must include `iss`, `aud`, `sub`, `jti`, `iat`, `exp`, and `observation`; `jti`
equals the observation ID. The signed observation includes its canonical
`payload_digest`. Accepted responses have the shape
`{ "observation": { ... }, "replayed": false }`.

Exact retries return `200` with `replayed: true` without adding a second evidence
record. Reusing an observation ID for changed contents returns `409` with
`error_code: "observation_id_conflict"`. Other trust and binding failures also
include machine-readable `error_code` values. Audit events record accepted,
rejected, and replayed metadata without copying the raw observation value.

Example tenant policy:

```json
{
  "intent_assurance": {
    "observations": {
      "max_age_seconds": 300,
      "max_future_skew_seconds": 30,
      "trusted_issuers": [{
        "issuer": "stripe-adapter",
        "profiles": ["support_refund.v1"],
        "predicates": ["refund.status"],
        "verification_methods": ["oidc", "jws"],
        "oidc_subjects": ["stripe-observer"],
        "oidc_issuers": ["https://identity.example.com"],
        "jws_subjects": ["stripe-observer"],
        "jwks_uri": "https://stripe.example.com/.well-known/jwks.json",
        "audiences": ["agentpass-observations"]
      }]
    }
  }
}
```

Unsigned observations are development-only. They require all three controls:
an agent environment of `dev`, `development`, `test`, or `local`; issuer policy
method `unsigned_dev`; and Worker variable
`AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED=true`.

Preview the evidence collected for the frozen contract without closing the job.
The optional job object is bound server-side to the registered intent and may be
updated by later previews until finalization starts:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-contracts/refund-case-1042/evaluate \
  -H 'content-type: application/json' \
  -d '{"job":{"started_at":"2026-07-20T18:00:00.000Z","completed_at":"2026-07-20T18:00:01.000Z"}}'
```

Finalize once the trusted evidence set is complete:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-contracts/refund-case-1042/finalize \
  -H 'content-type: application/json' \
  -d '{"job":{"started_at":"2026-07-20T18:00:00.000Z","completed_at":"2026-07-20T18:00:01.000Z"}}'
```

Finalization freezes decision events, execution receipts, verified observations,
and job evidence. The resulting `agentpass.intent-evidence-snapshot.v1` records
per-source counts, stable evidence IDs, source digests, and one canonical
`evidence_digest`. The final evaluation ID and snapshot ID are deterministic for
that evidence state. An identical retry returns the same receipt and snapshot
with `replayed: true`; changed job evidence or new runtime evidence returns
`409` with `error_code: "intent_evidence_finalized"`.

Read the complete lifecycle:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-contracts/refund-case-1042/evaluations
```

The response contains evaluation history, `latest_preview`, `final`, `snapshot`,
and `finalization_status`. Audit events distinguish preview evaluation, initial
finalization, repeated finalization, and rejected late evidence.

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

For provider trust, set `AGENTID_RECEIPT_PRIVATE_JWK` to an RS256 private JWK.
Successful non-replayed `/authorize` decisions then include
`authorization_receipt: { "jws": "..." }`. Providers verify that JWS against
`/.well-known/jwks.json` or `/jwks`, then enforce the bound receipt fields such
as tenant, agent, tool, action, resource, approval, JIT grant, request digest,
and expiry. Use `AGENTID_RECEIPT_PUBLIC_JWKS` to publish a rotation set that
includes old and active public keys, `AGENTID_RECEIPT_KEY_ID` to choose the
active signing key, and `AGENTID_RECEIPT_ISSUER` /
`AGENTID_RECEIPT_AUDIENCE` to set provider-verification claims.

Hosted tool constraints can require operational context with
`constraints.required_context` and restrict values with
`constraints.allowed_values`. The production deploy test uses those fields to
require environment, service, repository, branch, commit SHA, and change request
context before a `devops.deploy.production` grant can execute.

For GitHub Actions dispatch, set `AGENTID_GITHUB_TOKEN` as a Worker secret with
permission to dispatch workflows in the target repository. The dispatch payload
uses the approved `repo` or `github_repository`, `workflow_id`, branch/ref, and
bound context such as `commit_sha`, `change_request_id`, `incident_id`, and
`rollback_plan_id`. `AGENTID_GITHUB_API_BASE` can override the GitHub API base
URL for tests or GitHub Enterprise.

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
npx wrangler secret put AGENTID_GITHUB_TOKEN
npx wrangler secret put AGENTID_RECEIPT_PRIVATE_JWK
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
