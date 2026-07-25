# AgentPass Observability Console

This directory contains the Cloudflare-hosted UI/BFF and profile-scoped Fleet
Overview for the AgentPass intent observability console. It is intentionally
read only. Job exploration, evidence inspection, and exception views build on
this boundary in later slices.

## Security model

The browser talks only to the console Worker's same-origin
`/api/console/*` routes. The Worker:

1. verifies the RS256 signature on `Cf-Access-Jwt-Assertion` using the
   Cloudflare Access account JWKS;
2. validates the Access team issuer, application audience, token type, and
   time claims;
3. derives the tenant from a configured, signed Access claim;
4. rejects a mismatched route tenant before invoking the gateway;
5. reconstructs a read-only, allowlisted request with a server-owned gateway
   credential; and
6. calls the AgentPass gateway through a Worker service binding.

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

## BFF routes

All gateway routes are `GET` only and tenant-prefixed:

| Console route | Gateway route | Allowed query parameters |
| --- | --- | --- |
| `/api/console/tenants/:tenant/health` | `/tenants/:tenant/health` | none |
| `/api/console/tenants/:tenant/intent-quality/rollups` | same tenant path | rollup filters, limit, cursor |
| `/api/console/tenants/:tenant/intent-profiles[/:id]` | same tenant path | list pagination only |
| `/api/console/tenants/:tenant/intent-contracts[/:id]` | same tenant path | job/profile filters and pagination on lists |
| `/api/console/tenants/:tenant/audit/events` | same tenant path | audit filters and pagination |
| `/api/console/tenants/:tenant/approvals[/:id]` | same tenant path | list filters and pagination |

`/api/console/session` returns only the authenticated subject, optional email,
and derived tenant. `/api/console/health` checks the private gateway binding but
returns a sanitized readiness result rather than the gateway response.

Responses are `private, no-store`. The BFF marks upstream data as `fresh`,
`stale`, or `unknown` in `X-AgentPass-Console-Data-State` using the upstream
`X-AgentPass-Generated-At` or `Date` header and
`CONSOLE_STALE_AFTER_SECONDS`. Valid timestamps are normalized into
`X-AgentPass-Console-Generated-At` and
`X-AgentPass-Console-Data-Age-Seconds` so the browser can communicate staleness
without receiving arbitrary upstream headers.

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

## Production configuration

Deploy the `cloudflare/` gateway first. Then create a Cloudflare Access
self-hosted application for the console Worker URL and an allow policy for the
operator population.

Configure the identity provider to include a small, single-valued `tenant_id`
custom claim. Access places custom IdP claims under the signed `custom` object,
so the default Worker mapping is `custom.tenant_id`. The Worker fails closed if
the claim is missing, ambiguous, or not a safe tenant identifier. Keep this
claim required and small; Cloudflare may trim oversized custom claim sets.

Set the following Worker variables in Wrangler or the Cloudflare dashboard:

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONSOLE_ENVIRONMENT=production` | yes | Enables production fail-closed behavior. |
| `ACCESS_TEAM_DOMAIN` | yes | Exact Access team origin, such as `https://example.cloudflareaccess.com`. |
| `ACCESS_AUD` | yes | Access application audience tag; comma-separated tags are accepted during migration. |
| `ACCESS_TENANT_CLAIM` | no | Dotted signed claim path; defaults to `custom.tenant_id`. |
| `ACCESS_JWKS_URL` | no | HTTPS JWKS override; defaults to the team Access certs endpoint. |
| `CONSOLE_STALE_AFTER_SECONDS` | no | Upstream freshness threshold; defaults to 300 and is capped at one day. |

`keep_vars = true` preserves the dashboard-managed Access variables during CI
deploys. Keep the non-secret defaults in `wrangler.toml` and treat the dashboard
as the source for the account-specific `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.

Store the gateway API key only as a Worker secret. It must match the gateway's
`AGENTID_API_KEY`:

```bash
cd console
npm ci
npx wrangler secret put AGENTID_GATEWAY_TOKEN
npm run deploy
```

Do not put `AGENTID_GATEWAY_TOKEN` in `wrangler.toml`, GitHub variables, browser
storage, or client JavaScript. Production requests fail closed when this secret
or the `AGENTID_GATEWAY` service binding is unavailable.

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

For a self-contained Fleet Overview with two immutable support-refund profile
versions, run the loopback-only fixture server:

```bash
cd console
npm run dev:fixture
```

Open `http://127.0.0.1:8791`. The fixture contains completed, failed,
indeterminate, low-confidence, replay, retry, exclusion, small-sample, and
missing-metric examples. It has no gateway credential and uses the same
development-only mock identity guard as the Worker.

To verify the stale presentation locally:

```bash
AGENTPASS_FIXTURE_STALE=true npm run dev:fixture
```

## Verification and smoke checks

```bash
cd console
npm test
npm run dry-run
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
7. Request another tenant under `/api/console/tenants/<other>/health` and
   confirm a `403` without a gateway call.
8. Confirm browser network requests contain no reusable AgentPass bearer token.
9. Confirm missing or invalid Access assertions return an explicit `401`, and
   gateway outages render the unavailable shell state without upstream detail.
