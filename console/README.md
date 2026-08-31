# AgentAction Observability Console

This directory contains the Cloudflare-hosted UI/BFF for AgentAction
Observability. It combines self-service tenant setup, privacy-safe Activity,
profile-scoped Fleet Overview, finalized Jobs, and Job detail. Observability
reads remain read only; authenticated owners and operators can manage only
tenant onboarding, invitations, and source credentials.

## Hosted surfaces

AgentAction publishes two deliberately separate console deployments:

| Surface | URL | Data and access boundary |
| --- | --- | --- |
| Public demo | [agentaction-observability-demo.drisw.workers.dev](https://agentaction-observability-demo.drisw.workers.dev/?window=7#overview) | Unauthenticated, synthetic repository fixtures only, including synthetic Activity; no production binding, credential, tenant selection, audit routes, or approval routes. |
| Operator console | [agentpass-observability-console.drisw.workers.dev](https://agentpass-observability-console.drisw.workers.dev/?window=7#overview) | Cloudflare Access-protected tenant onboarding and evidence through a private gateway binding. |

The public demo reuses the production interface and interaction model but its
Worker entry point constructs an in-memory fixture service. It cannot read
runtime bindings supplied by a deployment environment. Requests outside health,
Fleet Overview, synthetic Activity, finalized Jobs, and Job detail receive a not-found response.
Never connect this public Worker to a gateway service binding or secret.

## Security model

The browser talks only to the console Worker's same-origin
`/api/console/*` routes. The Worker:

1. verifies the RS256 signature on `Cf-Access-Jwt-Assertion` using the
   Cloudflare Access account JWKS;
2. validates the Access team issuer, application audience, token type, and
   time claims;
3. accepts a signed-in identity without requiring a tenant claim, so a new
   operator can create a tenant or redeem an email-bound invitation;
4. treats an optional signed tenant/role claim as an authoritative legacy
   membership and otherwise checks the durable tenant directory server-side;
5. rejects any data route without a verified claim or directory membership;
6. reconstructs allowlisted requests with a server-owned internal service
   credential; and
7. calls the AgentAction gateway through a Worker service binding.

Browser-provided authorization, tenant, Cloudflare, and forwarding headers are
not copied to the gateway request. Gateway credentials, Access service details,
and raw upstream authorization failures are never returned to browser
JavaScript.

Cloudflare recommends validating the `Cf-Access-Jwt-Assertion` header even
when Access is in front of a Worker. Access signing keys are read from
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and cached briefly so
normal key rotation does not require a deploy:

- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Access application token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Workers service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)

## Workspace onboarding

Cloudflare Access remains the login and account-verification surface. After
login, an operator sees an always-available workspace control. They can:

- create an isolated first workspace, or create another when they own at least
  one existing workspace, with an optional first agent integration;
- follow an emailed, seven-day, single-use invitation that redeems
  automatically for their exact signed-in email, or enter its fallback code;
- switch among server-authorized directory memberships;
- adopt an existing SSO-pinned workspace as an owner without changing its data
  or credentials;
- see whether the tenant has received its first activity event;
- create, rotate, or disable sources as an `owner` or `operator`; and
- create viewer/operator invitations and inspect members as an `owner`.

Source tokens and invitation codes are displayed only in the response that
creates them. Only SHA-256 source-token digests and invitation-secret digests
are stored. Invitation links carry the secret in the URL fragment, which is
removed before the browser makes the authenticated redemption request and is
not sent in HTTP requests. The one-time code remains available as a manual
fallback when email delivery or automatic redemption fails.

Unmigrated signed claims remain visibly **Managed by SSO** and fixed to their
claimed workspace. Owner adoption is one-way, idempotent, and scoped to the
verified Access principal; it does not change another user with the same claim.

Workspace creation is framework-neutral. Owners and operators can add a Hermes
source or a custom AgentAction source afterward. The Agent connections form
shows connection steps and documentation for the selected integration;
Hermes-specific environment and YAML configuration appears only for a Hermes
source.

Roles are ordered `viewer < operator < owner`. Viewers can inspect data and
setup health. Operators can also manage source credentials. Owners can also
invite members, read the member list, and create additional workspaces.
Identities with no memberships may create their first workspace; identities
with only viewer/operator memberships may not create another. Invitations
cannot grant `owner`.

## BFF routes

All gateway routes are `GET` only and tenant-prefixed:

| Console route | Gateway route | Allowed query parameters |
| --- | --- | --- |
| `/api/console/tenants/:tenant/health` | `/tenants/:tenant/health` | none |
| `/api/console/tenants/:tenant/intent-quality/rollups` | same tenant path | rollup filters, limit, cursor |
| `/api/console/tenants/:tenant/intent-quality/jobs` | same tenant path | bounded time, profile, agent, verdict, constraint, confidence, exact job/intent IDs, limit, cursor |
| `/api/console/tenants/:tenant/intent-quality/jobs/:job_id` | same tenant path | none |
| `/api/console/tenants/:tenant/activity/events` | same tenant path | bounded time, agent, event, tool, shadow decision, execution state, intent binding, limit, cursor |
| `/api/console/tenants/:tenant/intent-profiles[/:id]` | same tenant path | list pagination only |
| `/api/console/tenants/:tenant/intent-contracts[/:id]` | same tenant path | job/profile filters and pagination on lists |
| `/api/console/tenants/:tenant/audit/events` | same tenant path | audit filters and pagination |
| `/api/console/tenants/:tenant/approvals[/:id]` | same tenant path | list filters and pagination |

`/api/console/session` returns the authenticated subject, optional email,
safe membership summaries, and a default tenant only when one can be chosen
unambiguously. `/api/console/onboarding/*` is an explicit allowlist for tenant,
invitation, setup, member, and source lifecycle operations. The public demo
returns `404` for every onboarding route and has no control-plane credential.

Responses are `private, no-store`. The BFF marks upstream data as `fresh`,
`stale`, or `unknown` in `X-AgentAction-Console-Data-State` using the upstream
`X-AgentAction-Generated-At` or `Date` header and
`CONSOLE_STALE_AFTER_SECONDS`. Valid timestamps are normalized into
`X-AgentAction-Console-Generated-At` and
`X-AgentAction-Console-Data-Age-Seconds` so the browser can communicate staleness
without receiving arbitrary upstream headers.

## Activity

Activity is the operational shadow-mode view. It reads only the tenant derived
from the verified Access identity and shows privacy-safe lifecycle metadata,
counterfactual policy decisions, actual execution status, Hermes correlation
IDs, and explicit intent binding state. It never displays raw prompts, messages,
tool arguments, commands, results, or provider bodies.

`Explicitly bound` means the observer supplied both a known intent ID and
digest. `Unbound` means it supplied neither. The UI does not infer intent from
session names, model output, or prompts. Outcome evaluation remains in the
immutable intent-contract and Jobs surfaces.

## Fleet Overview

The Overview is the default functional console view. It queries only immutable
final receipts through `/api/console/tenants/:tenant/intent-quality/rollups`
and offers these filters:

- bounded UTC window: 24 hours, 7 days, 30 days, or the API maximum of 90 days;
- profile key and immutable profile version;
- agent identity;
- completed, partial, failed, or indeterminate verdict; and
- pass, fail, or indeterminate constraint-compliance state.

The browser constructs only the BFF allowlist parameters. Tenant identity still
comes from the verified Access session and never from the filter form or page
URL.

Every returned profile key, version, and digest is a separate card. The
Overview never averages or ranks unlike profile definitions. Each card shows
finalized sample size, qualified success, goal attainment, outcomes,
constraint compliance, evidence-confidence distribution, execution-discipline
totals and per-job averages, metric coverage, and data-quality findings.
Indeterminate outcomes and low-confidence evidence remain named categories.

The query summary keeps scanned, finalized, matched, and excluded records
visible so practitioners can review the denominator. Small samples, incomplete
coverage, and exclusions produce an explicit partial-data state. Empty,
loading, unauthorized, forbidden, unavailable, and stale states are announced
through live regions and do not replace missing values with an inferred score.

## Finalized Jobs explorer

Jobs is the second functional console view. It reads only immutable final
receipts through `/api/console/tenants/:tenant/intent-quality/jobs`, ordered by
finalization time and intent ID. It supports the Overview boundaries plus
confidence band and exact job/intent IDs. Filter and cursor state is persisted
in the URL with only the BFF allowlist parameters.

The read model exposes identifiers, agent identities, immutable profile
key/version/digest, verdict, qualified success, constraint state, goal
attainment, evidence confidence, preview count, retry/replay counts, runtime,
and final status. It does not return raw decisions, execution receipts,
observations, snapshots, or evidence payloads. Selecting a job creates a stable
job-ID-only detail URL.

Rows keep missing agent/runtime data, indeterminate outcomes, and low confidence
explicit. Desktop uses an accessible table; narrow viewports transform the same
cells into labeled cards. Loading, empty, forbidden, unavailable, stale, and
partial-data states remain visible rather than being interpreted as success.

## Finalized Job detail

Job detail is the third functional console view. It resolves one server-derived
Job ID through the exact, query-free BFF route and renders only finalized
evidence. The direct browser URL contains the Job ID and view hash; it never
contains tenant identity, evidence, claims, or gateway credentials.

The view keeps the immutable profile, intent, snapshot, and evidence digests
visible alongside the final verdict, intent-relative goal attainment,
constraint result, evidence confidence, predicate summaries, and execution
discipline. Preview evaluations remain clearly separate from the final receipt.
Frozen source cards expose only counts and digests.

The evidence timeline is deterministic and ascending across authorization
decisions, execution receipts, verified observations, finalization, and valid
preview evaluations. Missing timestamps remain visible and sort last. Each
timeline event uses an explicit display allowlist; raw provider results,
arbitrary job payloads, observation values and claims, resources, approval
evidence, and reusable credentials stay server-side. Unselected, not-found,
malformed, unauthorized, forbidden, unavailable, stale, and data-finding states
are explicit and accessible.

## Production configuration

Deploy the `cloudflare/` gateway first. Then create a Cloudflare Access
self-hosted application for the console Worker URL and an allow policy for the
operator population.

For self-service SaaS onboarding, do not set `CONSOLE_STATIC_TENANT_ID` and do
not require a tenant claim in the Access policy. Access proves the person; the
AgentAction directory supplies tenant membership. Existing deployments may
continue to include a small `tenant_id` claim under the signed `custom` object.
The default mapping is `custom.tenant_id`, and `custom.tenant_role` can carry
`viewer`, `operator`, or `owner`. A claimed tenant without a valid role defaults
to `viewer`; it never gains source-management authority implicitly.

Set the following Worker variables in Wrangler or the Cloudflare dashboard:

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONSOLE_ENVIRONMENT=production` | yes | Enables production fail-closed behavior. |
| `CONSOLE_DIRECTORY_MODE=true` | yes for SaaS | Makes directory memberships authoritative even if a legacy static-tenant variable is still preserved by the deployment. |
| `ACCESS_TEAM_DOMAIN` | yes | Exact Access team origin, such as `https://example.cloudflareaccess.com`. |
| `ACCESS_AUD` | yes | Access application audience tag; comma-separated tags are accepted during migration. |
| `ACCESS_TENANT_CLAIM` | no | Dotted signed claim path; defaults to `custom.tenant_id`. |
| `ACCESS_ROLE_CLAIM` | no | Dotted signed role path; defaults to `custom.tenant_role`. |
| `ACCESS_JWKS_URL` | no | HTTPS JWKS override; defaults to the team Access certs endpoint. |
| `CONSOLE_STALE_AFTER_SECONDS` | no | Upstream freshness threshold; defaults to 300 and is capped at one day. |
| `CONSOLE_STATIC_TENANT_ID` | no | Legacy single-tenant mode. Omit for self-service SaaS onboarding. |
| `CONSOLE_STATIC_TENANT_ROLE` | no | Role for legacy static-tenant mode; defaults to `owner`. |

`keep_vars = true` preserves the dashboard-managed Access variables during CI
deploys. Keep the non-secret defaults in `wrangler.toml` and treat the dashboard
as the source for the account-specific `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.
The checked-in SaaS deployment sets `CONSOLE_DIRECTORY_MODE=true`, which
explicitly overrides any stale `CONSOLE_STATIC_TENANT_ID` retained by
`keep_vars`.

Generate one high-entropy internal service token and store the same value as
`AGENTID_INTERNAL_SERVICE_TOKEN` on both the gateway and console Workers. It is
separate from `AGENTID_API_KEY` and every tenant source token:

```bash
cd cloudflare
npx wrangler secret put AGENTID_INTERNAL_SERVICE_TOKEN

cd console
npm ci
npx wrangler secret put AGENTID_INTERNAL_SERVICE_TOKEN
npm run deploy
```

`AGENTID_GATEWAY_TOKEN` remains a compatibility alias for older console
deployments. Do not put either secret in `wrangler.toml`, browser storage, or
client JavaScript. Production requests fail closed when the internal secret or
the `AGENTID_GATEWAY` service binding is unavailable.

`workers_dev` is enabled for the initial hosted URL and preview URLs are
disabled. Protect the exact `*.workers.dev` hostname with Access before use. A
custom domain can replace it later without changing the Worker security model.

## Local development

The `development` Wrangler environment contains an explicit mock identity and
no Access configuration:

```bash
cd cloudflare
npm run dev

# In another terminal
cd console
npm run dev
```

The mock identity is read only from the development environment variables. A
deployment with `CONSOLE_ENABLE_MOCK_IDENTITY=true` and any environment other
than `development` returns a configuration error before serving a view or
calling the gateway.

Set a local gateway token with `wrangler secret put --env development` when the
local gateway requires API-key authentication. Tests use a fake service binding
and signed Access fixture; they never enable a production mock bypass.

For a self-contained Fleet Overview, finalized Jobs explorer, and Job detail
with two immutable support-refund profile versions, run the loopback-only
fixture server:

```bash
cd console
npm run dev:fixture
```

Open `http://127.0.0.1:8791`. The fixture contains completed, failed,
indeterminate, low-confidence, replay, retry, exclusion, small-sample, and
missing-metric examples across the functional views. Select
`job-refund-partial` to inspect the authorization, replayed execution,
verified-observation, finalization, and missing-timestamp preview sequence. The
fixture has no gateway credential and uses the same development-only mock
identity guard as the Worker.

To run the deployable public-demo entry point locally on port 8792:

```bash
cd console
npm run dev:public
```

To verify the stale presentation locally:

```bash
AGENTPASS_FIXTURE_STALE=true npm run dev:fixture
```

## Verification and smoke checks

```bash
cd console
npm test
npm run dry-run
npm run dry-run:demo
```

After deployment:

1. Visit the console URL and complete the Cloudflare Access login.
2. Confirm `/api/console/session` returns the expected tenant and current
   subject only.
3. Confirm `/api/console/health` reports both console and gateway as `ready`.
4. Confirm Overview loads with an explicit UTC window and renders every
   profile key/version/digest as a separate card.
5. Apply profile, agent, verdict, and constraint filters; confirm the page URL
   and BFF request contain only those filters plus `from`, `to`, and `limit`.
6. Confirm indeterminate and low-confidence rows, excluded records,
   data-quality findings, and small-sample status remain visible.
7. Open Jobs, apply confidence and exact job/intent filters, and confirm only
   finalized rows appear with URL-persisted filter state.
8. Select a Job ID and confirm its direct URL contains only `job_id`; verify the
   immutable boundary, predicate summaries, evidence counts, and ordered
   timeline render without raw evidence payloads.
9. Request another tenant under `/api/console/tenants/<other>/health` and
   confirm a `403` without a gateway call.
10. Confirm browser network requests contain no reusable AgentAction bearer token.
11. Confirm missing or invalid Access assertions return an explicit `401`, and
   gateway outages render the unavailable shell state without upstream detail.
