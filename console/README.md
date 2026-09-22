# AgentAction Console

This directory contains the Cloudflare-hosted UI/BFF for AgentAction
Observability. It combines self-service tenant setup, privacy-safe Activity,
profile-scoped Fleet Overview, finalized Jobs, Job detail, and tenant-scoped
eval routing. Observability reads remain read only; authenticated owners and
operators can manage tenant onboarding and source credentials, while only
owners can manage membership and eval configuration.

## Agent instances

The operator console also provides [My Agents](https://observability-console.agentaction.dev/agents): connect an MCP server, get AI suggestions, create a persistent instance, and review supervised runs. See [runtime setup, boundaries and limits](AGENT-RUNTIME.md).

## MCP capabilities and workflow coverage

In **MCP servers → My MCP servers**, open **Capabilities & limits** for a
connected server. It shows declared input/result fields, limits, advisory
annotations and bounded resource/template listings. **Refresh capabilities**
uses the stored credential and discovers metadata without executing tools or
reading resources. Refresh pauses affected agents and invalidates approvals;
a new supervised trial is required. Only owners and operators can refresh.
Public pre-check summaries are labeled separately and use no credentials.

In a draft, each capability offers **Relevant connected tools**, **Suggested MCP
servers**, and **Connect your own MCP server**. Suggestions include unconnected
servers from the cached registry, with provider details and the terms behind the
match. Refine **Find servers for** to name a service or a more specific subject.
No-match and registry failures leave the own-server path available. Local-only
or unsupported deployments require provider setup outside the console.

**Review & connect** preserves the draft and opens the existing endpoint and
authentication flow. After connection, return to the originating capability and
explicitly choose an actual discovered tool. Other mappings and field checks
stay intact. An additional **Choose another connected tool** control covers
existing tools whose metadata did not match. Unmapped capabilities show the
next action instead of schema warnings. These are text-based recommendations;
matching a listing does not establish that it supports the required workflow.
Queries stay within the cached registry service and never go to publishers.

After selecting a tool, open **Check fields and input connections**. Specify required fields, add scalar example inputs, or
connect a top-level input to an earlier step's result. Paths use JSON Pointer,
with `/*` for homogeneous array items, for example `/tickets/*/id`. Choose
**Save draft only** to retain these checks. They are assessment inputs only;
actual tool-call arguments still come from the separately reviewed trial.

A step is **Covered by declarations**, **Blocked for this mapping**, or
**Unknown**. Missing identifiers in a closed schema can block a workflow even
when both tools exist. Optional outputs, unsupported schemas, unspecified
inputs and older discovery snapshots remain unknown. Mapping changes and
catalog refreshes recompute the report. Account access, behavior and result
completeness are always unverified by this static check. Field lists are bounded
summaries; they do not represent all capabilities of the underlying service.

Resource discovery is limited to three pages and 32 entries per surface,
16 KB combined retained metadata and a shared ten-second request budget.
Errors and exceeded bounds stay incomplete. Result schemas are retained up to
16 KB and annotations up to 2 KB per tool; omitted metadata is disclosed.
Existing tool-catalog limits apply. No external schema references or provider
regular expressions are executed. See [CLI checks](../docs/mcp-capabilities.md).

Browser acceptance: install Playwright with Chromium, then run
`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --experimental-strip-types tests/capability-browser.mts`
from `console`. Run `tests/server-matching-browser.mts` the same way for per-capability discovery and connection acceptance. Both use synthetic local data only.

## Recurring agents and notifications

[Recurring agents](https://observability-console.agentaction.dev/automations) provide shared scheduling, saved state, findings and workspace email routing. Website Health is the first sample recipe. See [setup, boundaries and validation](RECURRING-AGENTS.md). Existing supervised MCP agents retain their approval requirements.

## Hosted surfaces

AgentAction publishes two deliberately separate console deployments:

| Surface | URL | Data and access boundary |
| --- | --- | --- |
| Public demo | [agentaction-observability-demo.drisw.workers.dev](https://agentaction-observability-demo.drisw.workers.dev/?window=7#overview) | Unauthenticated, synthetic repository fixtures only, including synthetic Activity; no production binding, credential, tenant selection, audit routes, or approval routes. |
| Operator console | [observability-console.agentaction.dev](https://observability-console.agentaction.dev/?window=7#overview) | Cloudflare Access-protected tenant onboarding, eval routing, and evidence through a private gateway binding. |

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
- end the current Cloudflare Access session from the account control when they
  need to authenticate with another identity;
- adopt an existing SSO-pinned workspace as an owner without changing its data
  or credentials;
- see whether the tenant has received its first activity event;
- create, rotate, or disable sources as an `owner` or `operator`; and
- create viewer/operator invitations and inspect members as an `owner`; and
- create immutable eval versions and assign them to new Jobs as an `owner`.

For an identity without a workspace, create and join choices are shown as
primary onboarding. Once connected, current-workspace setup appears first and
invitation redemption moves below it into a collapsed **Join another
workspace** control.

Source tokens and invitation codes are displayed only in the response that
creates them. Only SHA-256 source-token digests and invitation-secret digests
are stored. Invitation links carry a random, non-secret invitation identifier
in the query string so it survives Cloudflare Access authentication. The
console removes that identifier from browser history before asking the gateway
to redeem it for the exact verified email. The one-time secret-bearing code
never appears in the link and remains available as a manual fallback when email
delivery or automatic redemption fails. Previously issued fragment links are
still accepted and scrubbed before redemption.

Unmigrated signed claims remain visibly **Managed by SSO** and fixed to their
claimed workspace. Owner adoption is one-way, idempotent, and scoped to the
verified Access principal; it does not change another user with the same claim.

Workspace creation is framework-neutral. Owners and operators can add a Hermes
source or a custom AgentAction source afterward. The Agent connections form
shows connection steps and documentation for the selected integration;
Hermes-specific environment and YAML configuration appears only for a Hermes
source.

Roles are ordered `viewer < operator < owner`. Viewers can inspect data,
setup health, and eval configuration. Operators can also manage source
credentials. Owners can also configure evals, invite members, read the member
list, and create additional workspaces.
Identities with no memberships may create their first workspace; identities
with only viewer/operator memberships may not create another. Invitations
cannot grant `owner`.

The header's **Log out** action uses the same-origin
`/cdn-cgi/access/logout` endpoint documented by Cloudflare Access. It revokes
the Access session and clears the application authorization cookie; it does not
claim to sign the user out of their upstream identity provider. The public demo
does not display this action.

## Evals

Sources and evals are deliberately separate. A source authenticates and scopes
agent telemetry; an eval says how a new finalized Job will be measured. The
**Evals** view is readable by every workspace member. Owners can create a
named, immutable eval version and assign it at one of four routing levels:

1. exact source and agent;
2. agent across sources;
3. source across agents; or
4. workspace default.

The most specific matching assignment wins. If no assignment matches, the
gateway selects its built-in observed-execution or agent-declared-intent eval
according to the Job payload. The exact eval definition and assignment are
frozen into the intent contract when a Job starts, so changing a route affects
only later Jobs. Historical results remain grouped by eval/profile version and
digest. Assignment controls list only sources and agents in the active
workspace, preview the effective precedence, and warn about known uncovered or
incompatible traffic before an owner saves a route. The gateway repeats these
tenant and compatibility checks as the authoritative boundary.

The built-in v1 definitions expose two deterministic evaluator behaviors.
**Observed execution** uses
trusted lifecycle state and checks that a run completed. **Agent-declared**
checks lifecycle completion plus the agent's bounded self-report of goal,
criteria, and constraints. Creating another eval version names and versions one
of those behaviors; it does not turn a self-report into independent evidence
or run an LLM judge. Assigning an incompatible evaluator kind fails closed for
that Job export. The `refund_triage.v2` template adds six frozen deterministic
criteria for the policy outcome, applicable rules, invented facts, ambiguity
escalation, shadow-mode non-execution, and evidence capture. Each criterion
returns pass, fail, or insufficient evidence with a bounded explanation,
evidence references, and evaluator provenance. Hermes-reported criterion
evidence is labeled **Self-attested by agent · not independently verified** in
the definition, assignment, Jobs, and Job-detail surfaces; the immutable trust
value must agree with the frozen binding before the console will render it.

## BFF routes

All tenant evidence routes below are `GET` only and tenant-prefixed:

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
invitation, setup, member, source lifecycle, and eval operations. Eval
configuration is readable by workspace members; its create and assign routes
require `owner`. The public demo returns `404` for every onboarding route and
has no control-plane credential.

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
provider/model names, reconciled token components when reported, criterion
summaries, and final status. It does not return raw decisions, execution receipts,
observations, snapshots, or evidence payloads. Selecting a job creates a stable
job-ID-only detail URL.

Rows keep missing agent/runtime data, indeterminate outcomes, and low confidence
explicit. Desktop uses an accessible table; narrow viewports transform the same
cells into labeled cards. Loading, empty, forbidden, unavailable, stale, and
partial-data states remain visible rather than being interpreted as success.

## Finalized Job detail

Job detail is a contextual drill-down rather than a permanent navigation item.
Selecting a Job or opening a supported deep link resolves one server-derived
Job ID through the exact, query-free BFF route and renders only finalized
evidence. A clear Back to Jobs action preserves the active workspace. The
direct browser URL contains the Job ID and view hash; it never contains tenant
identity, evidence, claims, or gateway credentials.

The view keeps the immutable profile, intent, snapshot, and evidence digests
visible alongside the final verdict, intent-relative goal attainment,
constraint result, evidence confidence, predicate summaries, and execution
discipline. Richer deterministic evals add bounded criterion-level results,
explanations, evidence references, and matching frozen provenance without
rendering raw expected/actual values. Provider usage distinguishes uncached
input, cached input, output, and total tokens when the full split is reported;
missing cache telemetry stays explicitly unavailable. Preview evaluations
remain clearly separate from the final receipt. Frozen source cards expose only
counts and digests.

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


## Recipe adoption handoff

The public recipe directory links to `/?recipe=<catalog-id>&recipe_version=<version>#setup`. Only the bundled catalog's exact ID/version pair is recognized. The client displays setup context and retains this non-secret pair in console navigation. Unknown, duplicate or stale parameters receive a directory link, never injected query text. Recipe metadata is not forwarded to gateway data APIs and grants no permissions. Users still configure runtime connections and Evals explicitly.

## Tool catalogs before connection

The official MCP Registry's standard server record does not contain the
`tools/list` catalog. The console can enrich discovery using optional directory
APIs, without sending users' workflow text, search queries or account credentials
to those providers. Configure either or both secrets on the **operator** Worker:

```bash
cd console
npx wrangler secret put MCP_SMITHERY_API_KEY --env=""
npx wrangler secret put MCP_GLAMA_API_KEY --env=""
```

Do not configure these secrets on the public demo. Each credential is sent only
to its fixed provider API origin. Directory API keys are independent of the
user's MCP server login. Missing keys show **not configured** in catalog coverage;
the official registry and manual connection keep working.

Separate `smithery-v1` and `glama-v1` instances of the existing `McpRegistry`
Durable Object start indexing on the first catalog request. Each alarm loads ten
listings and their details (two detail requests concurrently), with a 10-second
request timeout and 1 MiB body limit. No MCP server is contacted by enrichment.
Snapshots refresh daily; a failed refresh retains the previous complete snapshot
and retries hourly. Crawls stop with an explicit error at 1,000 pages. Glama also
limits traversal to roughly 1,000 connectors: its results are a sample, not a
complete global catalog. The UI reports indexed listings and how many have tools.
Smithery and Glama failures are independent of the official registry.

Indexed tools are searchable by names, descriptions and schema fields. Each
listing retains at most 64 tools, 8 KiB per whole schema and 60 KB of tool metadata.
Oversized schemas are omitted whole, never rewritten into a misleading contract.
Missing, empty or unusable catalogs remain **unknown**; bounded or incomplete
catalogs are **partial**. Retrieval time is distinct from the provider's last
server-check time. Source declarations never become executable tool bindings.
Connection discovery and explicit actual-tool selection remain required. A
connected server's tool names can be compared with the indexed declarations;
matching names still do not prove matching schemas, permissions or completeness.

Every card using Glama data credits Glama and links its listing. See the
[Glama directory API and data license](https://glama.ai/mcp/reference) and
[Smithery server-details API](https://smithery.ai/docs/api-reference/servers/get-a-server).
Publisher documentation is the fallback link when schemas are absent; the
console does not invent tools from the underlying service's REST API, scrape
publisher pages, or infer unsupported operations from a missing catalog.
Shared OAuth login is available for explicitly configured providers; see the OAuth section below. Fixture-based tests
validate adapters and UI behavior; enable keys and inspect coverage to verify
live provider availability and actual indexed coverage in your deployment.

## MCP registry discovery

The authenticated `/agents` builder searches a shared catalog from the
[official MCP Registry](https://registry.modelcontextprotocol.io). Name and
description keywords plus curated capability categories support queries such as
“send emails” and “query a database.” These are publisher-advertised capabilities;
the existing connection flow still discovers actual account tools before AI
suggestions or execution.

The **Authentication** filter intersects with text and capability filters. The
optional `auth` parameter accepts `api-key`, `authorization-header`,
`other-secret` or `unspecified`; omit it (or use an empty value) for all types.
Result `authTypes` describe declared remote/package transport headers and package
environment variables, including optional inputs. API-key names and Authorization
headers are recognized; other explicitly secret inputs are grouped separately.
Values and credential defaults are never imported. Multiple types may match a
listing with multiple deployment variants. These labels do not verify an auth
scheme, required credentials, or builder compatibility.

The [official registry schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
has no standard authentication-scheme or pricing field. Missing metadata is
**Not specified**, never **No authentication** or **Free**. OAuth discovery and
pricing enrichment are not performed during search; use provider documentation.
Legacy cached listings are treated as unspecified until the normal hourly
refresh replaces them atomically. The response includes `authTypes` filter choices
and each server's `authTypes` IDs; existing callers may omit the new filter.

Deploy the `MCP_REGISTRY` binding, `McpRegistry` export and `mcp-registry-v1`
SQLite Durable Object migration together (included in `wrangler.toml`). The
source-specific `official-v1` object coordinates an hourly background snapshot.
Initial indexing starts on the first catalog read. Each alarm processes one
100-entry registry page, bounded to 1 MiB and 15 seconds, up to 1,000 pages (100,000 entries). The UI
labels incomplete initial results; subsequent refreshes retain the previous
complete snapshot until successful replacement. A failed or oversized refresh
keeps the last complete snapshot, shows a stale warning and retries in an hour.
Deprecated, deleted and non-latest entries are excluded on successful refresh.
The official registry requires no API key. Optional directory enrichment is described below. No Context7 dependency is added.

`GET /api/agents/:tenant/catalog?q=...&capability=...&auth=...&offset=...` requires the
same authenticated workspace membership as agent state; viewers may search.
Results have up to 20 entries per configured source per page and a `nextOffset`; the offset advances each source by 20. Counts describe directory listings, including cross-source duplicates. Registry metadata is shared;
workspace IDs, queries and credentials are not forwarded upstream. All external
fetches use the fixed registry API, reject redirects and bound response sizes.
Only public metadata is retained. Provider text is rendered as text and links
are restricted to HTTPS.

Selecting a supported remote fills the connection name and endpoint and clears
credentials and consent. It never connects, installs packages or enables an
endpoint. Cards and Connection details show whether the exact URL is enabled for
the selected workspace. Owners can review the URL, check the explicit consent
box and choose **Approve endpoint for workspace**. Approval sends only the hostname
to the fixed Cloudflare DNS resolver; it does not contact the MCP server or send
credentials. Operators can then connect and inspect its actual tools.

Workspace approvals persist with owner identity and timestamp, independently of
connections, with a maximum of 32 URLs and 30 validation attempts per day.
**Workspace endpoint approvals** lets owners remove access. This clears affected
connection credentials, pauses agents and cancels pending runs; already completed
or in-flight provider actions cannot be undone. Deployment-managed access through
`AGENT_MCP_ENDPOINTS` remains available (Firecrawl is the default). Removing a
workspace approval does not override that deployment policy.

Workspace approval requires an exact HTTPS URL on port 443 without credentials,
query parameters, fragments or templates. Literal IPs, local/reserved hostnames,
private/reserved A or AAAA answers, invalid aliases and unresolved DNS are rejected.
Public DNS is checked before each workspace-approved MCP request, including
session cleanup; failures block the request. MCP redirects are never followed.
The supported production deployment uses the Workers global public-internet
`fetch`, with `global_fetch_strictly_public` enabled in `wrangler.toml`. This
network boundary is required because DNS prechecks alone cannot prevent rebinding
between validation and connection. Do not replace MCP fetch with a private/VPC
binding or disable the flag. See [Cloudflare's compatibility flag documentation](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public).

Public/bearer-token and configured shared OAuth Streamable HTTP connections are supported;
unconfigured OAuth providers, stdio, legacy SSE, custom headers and parameterized URLs need
setup outside the builder. Registry listings do not establish provider trust or
authorize access. Manual endpoint entry remains available during catalog outages.

Run `npm test` for catalog SQLite, refresh, security-boundary and bundle tests.
`npm run test:browser` runs the synthetic browser acceptance suite when Playwright
and Chromium are installed. An existing installation can be supplied with
`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs`; optionally set
`PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. The suite starts a random-port
loopback fixture, never contacts MCP providers, and verifies search, selection,
manual connection, explicit owner approval without credentials, revocation, role
restrictions, unavailable/empty results, tenant races and mobile layout.


### Browser resource warnings and connection availability

The console uses system fonts and same-origin JavaScript. Its CSP intentionally
blocks injected third-party scripts and data-URL fonts. HTML retains private,
no-store cache control and adds `no-transform`, which prevents automatic edge
HTML injection such as the Cloudflare analytics beacon (see [Cloudflare's Web
Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/)). Browser
extensions can still inject their own styles; do not broaden the console CSP
solely to silence an extension's font warning. Compare with a clean browser
profile to isolate that source. Both `/favicon.png` and `/favicon.ico` serve the
same product PNG; the pages declare `/favicon.png` explicitly.

A disabled **Connect server** button is not an active request. The explanation
beside it identifies missing endpoint approval or insufficient workspace access
and the next step. Only an active request shows **Connecting…**, a wait cursor
and `aria-busy`. These availability states are independent of browser resource
warnings.


### My Agents account and roles

The account section on `/agents` shows the verified session email (or subject)
and the membership role for the selected workspace. **Log out** uses the same
origin's `/cdn-cgi/access/logout`, matching the main console. Return to `/agents`
to sign in again. Your identity provider may retain its own session; use its
account chooser or sign out there if it selects the same identity automatically.
Signing in does not assign a role: a workspace owner manages membership access.
**Workspace settings** opens the existing workspace and invitation controls.

An expired or unverifiable API session clears forms, hides the builder and shows
**Sign in**, which reloads `/agents` through the existing Access login boundary.
The app never changes membership roles or logs out automatically.


## Endpoint pre-check before provider authentication

**Browse servers** keeps registry search separate from **MCP connections**.
Selecting **Use this server** (or **Review setup** for other inspectable remotes)
opens focused setup, clears credentials/consent, and automatically pre-checks the
selected endpoint. Manual HTTPS entry is debounced for 700 ms. Invalid URL syntax
is not probed; server-side public-destination validation remains authoritative.
Catalog rendering, pagination and merely switching views do not probe providers.
Back to results preserves filters and loaded pages. Findings and approval/connect
feedback stay in the setup view beside the relevant actions.

Automatic checks call `POST /api/agents/:tenant/inspect-endpoint` with only
`{ endpoint, protocol? }`; **Recheck endpoint** adds `{ force: true }`.
The route requires current owner/operator membership and the existing same-origin
intent header. Provider credentials and extra body fields are rejected. Endpoint
approval is not required to inspect, and inspection does not grant approval.
This is available after signing into AgentAction, before creating or authorizing
a provider account; the public demo does not expose an anonymous scanner.

`/state` includes workspace-scoped `inspections`. The UI shows observations and
limitations prominently, including **OAuth discovered · workspace connection required**,
issuer metadata matching, advertised and challenged scopes separately, tool
visibility, bounded tool summaries and HTTP evidence. These are point-in-time
provider claims, not a safety certification, verified identity, granted scopes,
pricing or proof of backend behavior. Text-based risk signals are explicitly
heuristics. OAuth can coexist with an unauthenticated public tool catalog.

The inspector attempts MCP initialize/tools/list without credentials and reads
RFC9728 protected-resource metadata via a challenge or endpoint/root well-known
paths, then RFC8414/OIDC issuer metadata. Resource and issuer identifiers must
match; malformed metadata, unavailable discovery and blocked destinations remain
visible as incomplete findings. Only up to three advertised issuers are inspected.
Authorization/token endpoints are displayed as advertised URLs, never contacted.
No registration, browser login, tokens, model calls or tools/call is performed.

Each request uses the existing public DNS validator and Workers global public-only
fetch boundary, including metadata on different origins and session cleanup.
Redirects, literal IPs, private/reserved destinations, URL credentials and query
parameters are blocked. Limits: 30 seconds overall, 7 seconds per fetch, 16
non-DNS requests plus initial/each-hop A+AAAA DNS checks, 64 KiB per metadata
response, existing MCP limits (512 KiB per response, 80 tools/five pages), and
20 displayed tool summaries. Outcomes retain at most 32 reports per workspace
and 30 actual probes per UTC day. Reports for the exact endpoint and requested
protocol are reused for one hour within the workspace, before charging quota or
making outbound requests. Serialized runtime requests and an in-flight browser
map avoid duplicate automatic work. Force bypasses freshness, not quota or policy.
The additive `requestedProtocol` field distinguishes input from negotiated MCP
versions; older reports remain readable but are rechecked before cache reuse.
The latest report per endpoint is retained. A report never enables execution or
stores a token.

Cost: pre-checks use no model tokens. Each new probe uses bounded Worker/Durable
Object execution, DNS/HTTP requests and small report storage; network latency can
still reach 30 seconds. Individual checks are lightweight, but scanning every
catalog listing would multiply infrastructure work and provider traffic. Actual
billing depends on the deployment’s Cloudflare plan and usage.

See [Shared workspace OAuth](../docs/oauth-connections.md) for deployment, ownership
and provider compatibility. Discovery itself never starts a login flow.


## Agent lifecycle workspace

The primary navigation follows **Overview → Connect → Create → Run → Monitor → Improve**.
Overview (`/#overview`) is a dedicated home with workspace progress and a next action.
It reads existing setup and runtime state only while the home is open; missing data
stays unknown, pending approvals take priority, and switching workspaces invalidates
in-flight progress requests. Progress is advisory and never approves or executes work.

- **Create** (`/agents#create`): describe a job, review its tools and boundaries, and optionally
  reuse an agent template. Add MCP servers while mapping tools.
- **Run** (`/agents#run`): instances, supervised trials, exact-call approvals, daily schedules
  and retained run history. Creating an agent leads here.
- **Monitor**: Activity (`/#activity`), finalized Jobs (`/#jobs`), and Quality (`/#quality`).
  The Exceptions tab remains explicitly planned; no new exception engine is implied.
- **Improve** (`/#evals`): eval definitions and assignment rules, with a path back to agent creation.

**MCP servers** (`/agents#connect`) provides registry browsing, custom endpoints
and workspace server/account management as an unnumbered utility.

**Workspace settings** (`/#setup`) is a separate, unnumbered utility destination below
the lifecycle. It holds workspace creation/joining, members, invitations and sources.
Overview guides new users there with **Set up your workspace**; the home keeps its
Overview name after onboarding. Settings links preserve the selected workspace and
are hidden in the public demo.

Setup, activity, jobs, evals and job-detail deep links remain supported. The old fleet
Overview content now lives at `/#quality`. Internal cross-screen links carry a workspace
preference, which each screen checks against the session's authorized memberships.
The public demo home explains synthetic evidence and exposes only Overview and Monitor.
Run `node --experimental-strip-types tests/journey-browser.mts` with the same Playwright
options as the registry browser suite for state, navigation, workspace-race, mobile and
demo acceptance. No provider requests or account mutations occur in these fixtures.


## Agent template builder

In **Create**, describe a job or open an agent template. Define the goal, input
guidance, instructions, boundaries and success criteria in the same editor.
Save an unbound draft before mapping its capabilities to discovered MCP tools.
The advanced manual editor and existing single-server suggestions remain available.

**Save as a template** saves only the reusable definition. The **Your job
inputs** field belongs to the agent instance and is not copied into the template.
Keep secrets and customer data out of reusable definition fields; credentials
belong in MCP server setup. Definitions are visible to workspace members.

Use or edit a saved template to reuse it with fresh inputs. **Save new version**
creates an immutable numbered revision; **Save as new template** duplicates it.
An agent created from an unchanged saved revision pins that revision. Unsaved
edits create a custom definition pinned to the new agent. Existing agents never
change when a template is revised. A stale save asks you to reopen the latest
version. Each workspace supports 24 templates with eight revisions each.

Creating a draft does not execute tools or start a schedule. Run a trial and
approve each exact proposed call. The current runtime supports mapped MCP servers and
four total calls per run. Success text guides the AI assessment. Written boundaries guide the model.
Enable measurable checks to bind a contract and evaluate recorded evidence;
this does not turn prose into enforced controls or independent verification.

Automated UI acceptance (with Playwright installed, or `PLAYWRIGHT_MODULE` set
to its module path):

```sh
node --experimental-strip-types tests/workspace-recipe-browser.mts
node --experimental-strip-types tests/recipe-browser.mts
```


## Agent contracts and measurable evaluations

Enable **Bind a contract and measurable checks to each run** in Create. This is
on for new authoring sessions; existing saved recipes preserve their previous
setting. Add up to eight checks, using selected tools:

- **Tool call succeeded:** at least one recorded successful call to that tool.
- **Tool was not called:** no recorded call attempt to that tool.
- **Structured result field:** a dot-separated field under the latest named
  tool call's MCP `structuredContent`, compared to typed text/number/boolean,
  numeric bounds, or existence. Plain text is not parsed or inferred into facts.

All checks are required. Every bound run also checks successful completion,
at least one successful tool call, selected-tool scope, recorded approval and
at most four calls. Missing or truncated structured results are insufficient
evidence, even when the AI reports success. A provider-reported field establishes
what the provider returned, not whether the business fact is independently true.

The server compiles an immutable profile using the shared intent evaluator and
freezes a new contract before each run's first inference. The contract binds the
profile, recipe revision when saved, instance identity, input digest and tool
scope. Terminal results include contract/profile/source/evidence digests and
per-check references. Cancellation, failure and restart interruption finalize
evaluations too; reads do not reevaluate historical records. Activation requires
a passing bound evaluation plus the existing successful, reviewed trial.

Bound runs reserve storage for their contract and final evaluation. Oversized
proposals are rejected before approval. If retained output exceeds the run's
storage budget, it is explicitly omitted and checks requiring it become
insufficient evidence.

Inspect the same binding in **Run → Contract & evaluation**, hosted **Jobs →
Details**, and **Evals → Hosted agent evaluations**. Gateway definitions and
external-agent routing remain separate. These hosted records do not claim a
signed gateway receipt. Existing runs remain unbound; to enable checks for an
existing agent, create a new draft from the revised recipe.

Acceptance: `node --experimental-strip-types tests/recipe-evaluation-browser.mts`
uses synthetic MCP output and verifies Create → approval → Run → Jobs → Evals.


## Agent-first setup

Create is the first lifecycle step. Describe the job without choosing an MCP
server. **Help me choose an agent** replaces generic example prompts with an
optional function/area profiler. Choose or type an area and optionally name an
improvement. Up to three AI-suggested jobs explain their value and capability
needs, based only on the chosen function/area and optional context. Connected
servers and tools never enter profiler inference. Tool discovery and mapping
happen after an idea is chosen, during drafting. **Use this idea** only prefills
the editable job description.
The user still selects **Draft my agent**, reviews mappings and approves actions.

`POST /api/agents/:workspace/profile-agents` accepts `area` (1–100 characters)
and optional `context` (up to 1,000). It requires an owner/operator and the same
origin/session protections as drafting. It shares the 12/day suggestion and
120/day inference budgets. Profile inputs/results are not stored by the runtime;
only quota counters change. Workspace/session changes clear browser profile state,
and edits invalidate pending results. Credentials are rejected/redacted. Profiler
capability match arrays remain empty for response compatibility; model-proposed
tool mappings are rejected. Automated acceptance: `console/tests/agent-profiler.test.ts` and
`console/tests/agent-profiler-browser.mts`.

**Browse examples** optionally reveals catalog and saved starting points; empty
saved sections stay hidden. **Continue an agent** appears only when unfinished
drafts exist. Manual editing is under **Set up manually**, and reusable saving
is optional within Customize. The runtime saves a workspace draft containing reusable authoring fields,
private job inputs, one to four capability requirements and suggested tool
matches. Up to 24 drafts are retained. Catalog and workspace agent templates can
also become drafts without server access. Existing recipe IDs, URLs and legacy
single-server APIs remain compatible.

The tools editor offers **Browse available MCP servers** and **Add your own MCP
server**. Current workspace tools appear as mapping choices. A unique matching
tool is proposed; equivalent accounts require an explicit choice. Advertised
registry capabilities never become executable bindings. Setup detours persist
the draft; **Save draft only** allows unresolved tools. **Review first action**
requires every capability to map to a connected, approved server and actual tool.
The first proposal still requires exact-action approval.

Mapped agents use distinct capability identifiers even when multiple servers
expose the same tool name. All mapped servers share a four-call budget. Contracts
freeze the mapping, run events retain the actual source, and evaluation verifies
that each call used its bound source. Disconnecting or reconnecting any mapped
server pauses affected agents, cancels pending calls and clears prior trial
eligibility. Written boundaries remain model instructions, separate from the
enforced tool scope, approval requirement and call budget.

New additive routes are `save-draft`, `template-draft` and `create-bound`; `draft`
without `connectionId` authors the agent-first plan. Supplying `connectionId`
retains legacy drafting behavior. Workspace authorization, same-origin write
checks, quotas and credential exclusion apply to every route. Reusable templates
may retain capability labels but never account mappings or private inputs.

Acceptance: `node --experimental-strip-types tests/guided-create-browser.mts`,
`tests/agent-plans.test.ts`, and the template/evaluation browser suites.

## Public MCP readiness checker

The [MCP Readiness Check](https://mcpcheck.agentaction.dev/) is a
separate public Worker. It shares `mcp-precheck.ts` and the versioned
`mcp-readiness.ts` profile engine with workspace inspections. The public page
supports anonymous HTTPS Streamable HTTP discovery, protocol selection,
source-linked findings, declared tool schemas, JSON export and opt-in public
reports. No tool calls, resource reads, model calls or credentials are sent.

Only checks explicitly submitted with publication enabled enter the separate
`McpReadiness` SQLite store. Unpublished checks return to the caller without
report persistence; the daily counter contains no endpoint or account data.
The latest 1,000 published reports are retained. Publication does not establish
publisher ownership or certify a provider. Anyone knowing a report link can read
it; published observations can appear in AgentAction discovery. Do not publish
sensitive endpoint names. No workspace report is copied into this store.

Discovery uses the optional `MCP_READINESS_SERVICE` binding to look up public
profiles by exact endpoint. Only catalog endpoint URLs cross that binding, never
workspace IDs, search text, credentials or connected-account evidence. The most
recent published check wins, including failures. Cards label tool declarations,
public observations, time/protocol and untested behavior separately; failure of
the evidence service does not block catalog search or authorize any endpoint.

Profiles use `agentaction.mcp-readiness.v1` and an independently versioned ruleset.
They expire after 24 hours or a ruleset change. The SHA-256 catalog fingerprint
canonicalizes bounded discovered tool metadata (sorted tool names and object
keys); omitted/truncated metadata and changed backend behavior are not covered.
Server identity is retained when initialization exposes it; stateless discovery
may not expose a server version. No account-level permissions, retry behavior,
side effects or full conformance are verified. Test a changed catalog again;
there is no scheduled refresh in this release. Workspace inspection reuse remains
one hour; force a recheck for new readiness fields on older cached reports.

The public API accepts only endpoint, supported protocol, and explicit boolean
`publish`. Unknown fields, credentials, local/IP/query-bearing endpoints and
redirects are rejected. The Worker sets `global_fetch_strictly_public` to enforce
the egress boundary even across DNS changes. Request/response/time budgets are
inherited from the pre-check engine. Reports show up to 20 tools / 32 KB and 32
findings, with omissions labeled. This limit is separate from discovery's 80-tool,
five-page and 80,000-character metadata ceiling.

Abuse controls: Cloudflare's per-IP rate limiter permits five checks per minute
(per location, approximate); the Durable Object enforces 100 attempts per UTC day
across the service and three concurrent probes. Requests without the edge's IP
header fail closed. Same-origin JSON plus a custom header prevents browser
cross-site submissions. Public lookups never trigger probes. The report API has
no credential-bearing or imported-evidence ingestion route.

Deploy `npm run deploy:readiness` before `npm run deploy`; CI performs this order.
The new Worker has its own `readiness-v1` SQLite migration and needs no secret.
Its compatibility date is 2026-09-18, the newest date supported by the repository's
current local runtime. `npm run dry-run:readiness`, `npm run test:readiness-worker`
and `npm run test:readiness-browser` validate it. Browser checks use Playwright
via `PLAYWRIGHT_MODULE` when not installed locally. Generated binding types live
in `src/readiness-env.d.ts`.

The readiness browser asset serializes functions from the Worker bundle. Keep
`keep_names: false` in its Wrangler configuration: name-preservation helpers
otherwise become unresolved references in the browser. Worker acceptance builds
with the production Wrangler configuration and executes the served script,
checking that form and export event handlers register before exercising the API.

The checker uses the `mcpcheck.agentaction.dev` custom domain on the existing
readiness Worker. Its workers.dev address remains available for existing links;
both hosts share report storage and quotas. Forms require the same request origin.

## Shared workspace OAuth

Owners can connect configured OAuth providers for shared agents. See
[OAuth deployment and ownership](../docs/oauth-connections.md) and the
[Notion configuration](examples/oauth-notion.json). The feature is disabled until
provider settings, a fixed callback origin and encryption secrets are configured.
