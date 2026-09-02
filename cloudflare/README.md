# AgentAction Cloudflare Gateway

This Worker exposes the AgentAction gateway API on Cloudflare Workers. It can sit
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
| `POST /intent-profiles` | Register and freeze a versioned intent profile with its canonical digest |
| `GET /intent-profiles` | List registered profile versions for the tenant |
| `GET /intent-profiles/<profile>.<version>` | Read one frozen profile definition and lifecycle status |
| `POST /intent-profiles/<profile>.<version>/issue` | Deterministically issue and register a per-job contract from typed variables |
| `POST /intent-contracts` | Register and freeze an intent contract with its canonical digest |
| `GET /intent-contracts` | List registered intent contracts |
| `GET /intent-contracts/<intent-id>` | Read a registered contract and lifecycle status |
| `POST /intent-contracts/<intent-id>/observations` | Record a provider or application observation bound to the contract |
| `POST /intent-contracts/<intent-id>/evaluate` | Emit a non-finalizing preview evaluation |
| `POST /intent-contracts/<intent-id>/finalize` | Atomically freeze evidence and emit the one final snapshot-bound receipt |
| `GET /intent-contracts/<intent-id>/evaluations` | Read evaluation history, latest preview, final receipt, and evidence snapshot |
| `GET /intent-quality/rollups` | Aggregate finalized receipts into profile-scoped quality groups for a bounded time window |
| `GET /intent-quality/jobs` | List tenant-scoped finalized jobs with bounded filters and opaque cursor pagination |
| `GET /intent-quality/jobs/:job_id` | Read one finalized job's immutable boundary, evaluation summaries, evidence counts, and allowlisted timeline |
| `POST /tenants/<tenant-id>/activity/batches` | Ingest a privacy-safe observer batch using a tenant/source-scoped write-only credential |
| `GET /tenants/<tenant-id>/activity/events` | Read tenant activity with bounded time, agent, event, tool, decision, execution, and intent-binding filters |
| `/control-plane/*` | Private console-only tenant directory, invitation, setup, member, and activity-source lifecycle API |
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
| `POST /audit/webhook/agentid` | Receive AgentAction audit webhook events |

Approval requests, JIT grants, and idempotent execution results are stored in a
SQLite-backed Durable Object namespace. This keeps approval state, single-use
grant enforcement, and retry-safe result replay durable across Worker isolates.
Intent profiles, issued contracts, bound decision events, execution receipts,
observations, job evidence, and evaluation receipts use the same tenant-scoped
durable store. All API routes in the table can be prefixed with
`/tenants/<tenant-id>`.

## Shadow activity ingestion

Observer credentials are separate from gateway and console credentials. Store
only a SHA-256 digest in the tenant manifest and give the cleartext token only
to that observer source:

```yaml
observability:
  ingestion:
    sources:
      hermes-production:
        enabled: true
        token_sha256: sha256:<64-lowercase-hex-digest>
        agent_ids:
          - customer-support-hermes
```

The source posts to
`POST /tenants/acme/activity/batches` with `Authorization: Bearer <token>` and
`X-AgentAction-Source-Id: hermes-production`. Generic API keys and console
credentials do not authorize this write path. The route rejects tenant/source
drift, unapproved agents, batches over 256 KiB or 100 events, unknown fields,
changed replay content under an existing event ID, and payload-bearing fields
outside the strict privacy-safe schema.

Each tenant uses its own Durable Object name. The newest 2,000 events remain
queryable, exact retries are counted as duplicates, and an event ID reused for
different content returns `409`. `GET /tenants/:tenant/activity/events` uses
normal gateway authentication and never returns source credentials.

Intent linkage is an optional evidence dimension on an activity event. A
`bound` event must carry both an explicit `intent_id` and `intent_digest`;
otherwise it is stored as `unbound`. The activity API does not infer intent or
replace contract registration, trusted outcome evidence, or final evaluation.

## Private tenant control plane

The hosted console uses `/control-plane/*` to onboard tenants without asking
each customer to deploy a dashboard. These routes require the exact
`AGENTID_INTERNAL_SERVICE_TOKEN`; the public API key and tenant source tokens
are rejected. The console supplies only identity fields it derived from a
verified Cloudflare Access JWT over the private service binding.

The directory is stored in a dedicated, consistently named Durable Object and
keeps tenant records, subject memberships, per-principal workspace mode, and
expiring single-use invitations.
Tenant manifests and source-token digests remain in `AGENTID_MANIFESTS` KV.
Tenant creation provisions a non-enforcing shadow-observability manifest; an
optional first source returns its token once. A signed-claim owner can adopt an
existing tenant into directory mode without rewriting its manifest. Source
rotation invalidates the prior token
immediately; disabling a source stops new ingestion without deleting retained
events.

Workspace invitations use the `INVITATION_EMAIL` native Email Service binding.
Set `AGENTACTION_CONSOLE_URL` to the Access-protected console and
`AGENTACTION_INVITATION_FROM_EMAIL` to an allowed sender on an onboarded domain.
The email includes an email-bound auto-redeem link whose query string carries
only a random, non-secret invitation identifier so it survives Cloudflare
Access authentication. The console removes that identifier from browser
history before redemption, and the gateway requires the exact verified invitee
email. The secret-bearing one-time code appears only as a manual fallback. A
delivery error does not invalidate or delete the invitation; the owner can
securely share that code.

```toml
[vars]
AGENTACTION_CONSOLE_URL = "https://console.example.com/"
AGENTACTION_INVITATION_FROM_EMAIL = "invites@example.com"

[[send_email]]
name = "INVITATION_EMAIL"
allowed_sender_addresses = ["invites@example.com"]
```

The console Access policy must permit the invitee's exact email to authenticate
before the gateway can verify and redeem the invitation.

For the SaaS topology, configure both bindings in `wrangler.toml`, then put the
same high-entropy internal token on the gateway and console Workers:

```bash
cd cloudflare
npx wrangler secret put AGENTID_INTERNAL_SERVICE_TOKEN

cd ../console
npx wrangler secret put AGENTID_INTERNAL_SERVICE_TOKEN
```

Do not reuse `AGENTID_API_KEY`, an activity source token, or an Access token for
this service credential. The cleartext source and invitation secrets are never
persisted by the control plane.

## Versioned intent profiles

Register the frozen profile definition before issuing job contracts:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-profiles \
  -H 'content-type: application/json' \
  -d @../packages/guard/examples/support-refund-profile.json
```

The gateway computes `profile_digest` over the canonical
`agentpass.intent-profile.v1` definition and freezes the composite key, such as
`support_refund.v1`. Re-registering the same definition is idempotent. Changed
contents under the same profile name/version return `intent_profile_frozen`;
a changed definition must use a new version.

Issue a contract with only the profile's declared, typed variables and explicit
timestamps:

```bash
curl -s http://127.0.0.1:8787/tenants/acme/intent-profiles/support_refund.v1/issue \
  -H 'content-type: application/json' \
  -d '{"intent_id":"refund-case-1042","job_id":"case-1042","variables":{"payment_id":"pi_123","refund_amount":49},"issued_at":"2026-07-20T17:59:00Z","expires_at":"2026-07-20T18:30:00Z"}'
```

Issuance resolves explicit `{ "$variable": "name" }` values in profile
predicates, applies typed defaults, copies profile outcomes, hard constraints,
evidence requirements, trusted-observation requirements, and preferences, then
binds the resulting contract to `profile_version`, `profile_digest`, and the
normalized `profile_variables`.
Unknown variables or top-level contract overrides are rejected, so job input
cannot weaken the profile. Equivalent timestamps and reordered variable objects
produce the same contract and `intent_digest`.

Tenant manifests select the raw-contract compatibility boundary:

```yaml
intent_assurance:
  contract_issuance:
    mode: registered_profile_required # or raw_compatible
```

`registered_profile_required` rejects direct `POST /intent-contracts` calls.
`raw_compatible` preserves the original raw-contract registration route, while
profile-bound contracts must still use the profile issuance endpoint. A profile
with trusted-observation requirements can be registered or issued only when the
tenant observation policy permits a matching issuer, predicate, profile key,
and verification method.

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

## Profile-scoped intent quality rollups

Query finalized execution quality over an explicit time window:

```bash
curl -s 'http://127.0.0.1:8787/tenants/acme/intent-quality/rollups?from=2026-07-20T00%3A00%3A00Z&to=2026-07-22T00%3A00%3A00Z&profile_key=support_refund.v1&profile_version=v1&minimum_sample_size=10'
```

Both `from` and `to` are required. The half-open `[from,to)` window is capped at
90 days. Optional filters are `profile_key`, `profile_version`, `agent_id`,
`verdict`, and `constraint_compliance`. `limit` and the returned `next_cursor`
paginate immutable profile groups; they do not truncate the jobs used to
calculate a returned group.
The agent filter matches identities frozen in job, decision, or execution
evidence; a final receipt with no agent identity remains visible through the
group's missing-agent data-quality count.

The API reads only `evaluation_mode: final` receipts bound to an immutable
snapshot. Preview evaluations and unfinalized contracts are never counted.
Receipts without a versioned profile binding are excluded, and different
profile keys, versions, or digests are always returned as separate rollups.
The response reports scanned, finalized, matched, and excluded record counts so
filtering and incomplete data remain visible.

Each `agentpass.intent-quality-rollup.v1` includes:

- completed, partial, failed, and indeterminate counts and rates;
- constraint pass, fail, and indeterminate counts and rates;
- qualified-success rate and average goal attainment;
- evidence-confidence distribution (`low < 0.75`, `medium < 0.9`, `high >= 0.9`);
- tool-call, execution, retry, replay, denial, runtime, cost, and preference aggregates;
- metric coverage, minimum-sample status, and explicit data-quality findings.

Indeterminate and low-confidence jobs remain separate categories. Rollups are
observability outputs only: they never expand permissions, budgets, or runtime
authority. OIDC deployments can assign a dedicated `intent_quality` scope; if
it is omitted, the endpoint falls back to the configured intent-contract scope.
The complete response shape is defined by
[`intent-quality-rollup.schema.json`](../schema/intent-quality-rollup.schema.json),
with a realistic refund fixture at
[`support-refund-quality-rollup.json`](../packages/guard/examples/support-refund-quality-rollup.json).

## Finalized intent quality jobs

List receipt-derived job rows over the same bounded time window:

```bash
curl -s 'http://127.0.0.1:8787/tenants/acme/intent-quality/jobs?from=2026-07-20T00%3A00%3A00Z&to=2026-07-22T00%3A00%3A00Z&profile_key=support_refund.v1&confidence=low&limit=25'
```

Optional filters are `profile_key`, `profile_version`, `agent_id`, `verdict`,
`constraint_compliance`, `confidence`, `job_id`, and `intent_id`. Rows are
ordered newest-first by immutable `finalized_at` and intent ID. The opaque
`next_cursor` resumes after that tuple without offset-based duplicates or
skips.

Each `agentpass.intent-quality-job.v1` includes the tenant, job/intent IDs,
agent identities, immutable profile binding, outcome, confidence, preview
count, retry/replay/runtime summary, data-quality findings, and `finalized`
status. Hermes lifecycle Jobs may also include a bounded `model_usage` summary:
request and coverage counts, optional provider-reported input/output/total
tokens, and up to 20 provider/model groups. Missing usage is omitted rather
than represented as zero. Raw snapshots, decisions, execution receipts,
observations, and evidence payloads are deliberately absent.

Read one finalized Job receipt by its server-derived identifier:

```bash
curl -s 'http://127.0.0.1:8787/tenants/acme/intent-quality/jobs/job-refund-partial'
```

`GET /intent-quality/jobs/:job_id` accepts no query parameters and returns only
a tenant-local, finalized receipt. Historical receipts remain resolvable
through the tenant intent index; a duplicate Job ID fails explicitly rather
than selecting an arbitrary intent. Preview-only and cross-tenant matches
return not found.

The `agentpass.intent-quality-job-detail.v1` response contains the same safe Job
row, immutable profile/intent/snapshot boundary, final predicate and execution
discipline summaries, valid preview summaries, frozen evidence source
counts/digests, the same optional model-usage summary, and a deterministic
ascending timeline. The timeline includes
only allowlisted authorization, execution, observation-verification,
preview-evaluation, and finalization fields. Missing timestamps are nullable
and sort last with a stable event/identifier/source-index tie breaker. Raw
provider results, arbitrary job payloads, observation values and claims,
approval evidence, resources, and credentials are never projected.

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
need to push AgentAction audit events into the console:

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
