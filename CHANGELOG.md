# Changelog

## Unreleased

No changes yet.

## 0.39.0-rc.1 - 2026-09-24

### Added

- Guide draft setup through job details, sources, guardrails and checks, and a supervised trial. Show the next missing step prominently, retain editable sections, and tuck alternative entry points and source options away until needed.
- Distinguish connected server and tool cards with a background, border and text label without changing capability-based ranking. Avoid duplicate representations of the same discovered tools.

### Fixed

- Move AI data-use disclosure from the connection checkbox to drafting, source comparison, suggestions and trials. Connecting still only discovers capabilities; exact endpoint, OAuth, draft and per-action approvals remain unchanged. Defer automatic source comparison until the sources step is opened.
- Repair old, uncreated drafts that mistakenly require an unbound generic analysis/summarization tool. Preserve external requirement IDs, mappings, inputs and outcome rubrics, and require fresh review after normalization. Preserve concrete tool matches, field checks, custom evidence checks, templates and existing agents.

### Compatibility and migration

- Existing agents, connections and schedules retain their behavior. Legacy draft cleanup runs idempotently when the workspace runtime starts; ambiguous or specialized requirements are retained. No new autonomous execution or report-delivery authority is introduced.
- Install Python artifacts from the GitHub v0.39.0-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.38.1-rc.1 - 2026-09-24

### Fixed

- Label Apify Actor credentials as a required API token, link to Apify Console, and explain where to find the token and how to enter it. Anonymous endpoint pre-checks remain available without credentials.
- Reject empty Apify Actor credentials before discovery or connection quota is consumed. Clear an entered credential when switching endpoint destinations, and require a replacement token when reconnecting an Apify Actor.

### Compatibility and migration

- Backward-compatible connection setup fix. Existing server-side credential storage, public-server connections, shared OAuth and exact endpoint approvals are unchanged. No migration required.
- Install Python artifacts from the GitHub v0.38.1-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.38.0-rc.1 - 2026-09-23

### Added

- Resolve Apify Actor listings to documented hosted MCP endpoints, including existing catalog snapshots. Selecting a server fills its Actor-scoped endpoint, starts an anonymous pre-check, and explains the API-token requirement with a setup source link.
- Support the single-Actor `tools` query on the exact Apify MCP endpoint. Credentials and all other query configurations remain rejected; workspace approvals still apply to the exact endpoint.

### Fixed

- Explain when automatic setup is unavailable before offering manual endpoint entry. Do not present an empty connection form as ready to connect.
- Show authentication-required pre-check findings when Apify advertises base-service OAuth metadata, without claiming scoped OAuth verification or granting access.

### Compatibility and migration

- Existing query-free endpoints remain compatible. No stored-data migration or automatic endpoint approval. No credentials or tool executions are used by pre-checks.
- Install Python artifacts from the GitHub v0.38.0-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.37.2-rc.1 - 2026-09-23

### Fixed

- Recognize combined generic processing labels such as text analysis and summarization, so they do not become redundant MCP setup requirements alongside external capabilities. Preserve specialized/provider terms, source retrieval and concrete tool bindings.

### Compatibility and migration

- Backward-compatible draft normalization fix; existing saved plans and permissions are unchanged. No migration required.
- Install Python artifacts from the GitHub v0.37.2-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.37.1-rc.1 - 2026-09-23

### Fixed

- Preserve unanswered scope questions when selecting a provider and returning from connection setup.
- Keep generic text analysis, reasoning and report writing inside the agent instead of adding redundant MCP setup requirements alongside external capabilities. Preserve named/specialized services and concrete tool bindings.
- Require tool recommendations to match both the requested source and operation; do not fill suggestions with tools needing adaptation. Clarify that completeness ratios count findings once, not individual fields.

### Compatibility and migration

- Backward-compatible draft-generation correction; existing plans, contracts and permissions are unchanged. No migration required.
- Install Python artifacts from the GitHub v0.37.1-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.37.0-rc.1 - 2026-09-23

### Added

- Generate editable pass thresholds, measurement procedures and evidence sources with agent drafts. Freeze them into trial contracts and require the AI assessor to report observed measurements; missing evidence remains inconclusive.
- Make every suggested provider actionable with contextual connection steps, explicit unknown pricing and provider links. Name and navigate to each capability still missing a discovered tool.

### Compatibility and migration

- Additive prerelease evaluation fields; existing definitions and contracts remain readable with no migration or new permissions. Newly generated drafts require measurement details. AI measurements remain labeled as assessments, not deterministic calculations.
- Catalog pricing is not collected; no cost or free-tier claims are inferred. Selecting a provider does not bind a tool, approve an endpoint or authorize execution.
- Install Python artifacts from the GitHub v0.37.0-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.36.1-rc.1 - 2026-09-23

### Fixed

- Assign generated outcome-check IDs in the application. Missing, duplicated or reserved model-authored IDs no longer reject otherwise valid guardrails and evaluation criteria; labels and criteria remain intact and validated.
- Describe draft generation as preparing the plan, guardrails and success checks, without implying connected-tool bias.

### Compatibility and migration

- Backward-compatible patch prerelease; no permission or data migration changes. Existing saved evaluation IDs remain unchanged.
- Install Python artifacts from the GitHub v0.36.1-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.36.0-rc.1 - 2026-09-23

### Added

- Generate job-specific guardrails and outcome evaluation criteria together with provider-neutral capability requirements. Connected inventory no longer shapes the draft objective or preselects tools.
- Compare catalog and connected candidates by capability fit, followed by an AI suitability assessment with explicit limitations. Connection status affects setup rather than ranking; provider metadata remains unverified.
- Review and edit guardrails and outcome checks before tool setup. Record approval of the current definition, job inputs and mappings before a generated draft can start its supervised trial; edits invalidate approval.
- Evaluate frozen outcome criteria against the final answer and retained tool evidence. Label these results as AI assessments separately from recorded runtime controls and provider-reported field checks. Missing, invalid, changed or truncated evidence remains inconclusive.

### Compatibility and migration

- Minor prerelease: additive hosted evaluation rubrics and draft-review metadata. Existing saved definitions and trials remain readable; no data migration. Generated drafts require review, while exact-action approvals and the four-call runtime limit remain unchanged.
- Proposed written guardrails are agent instructions, not new runtime-enforced policies or grants of permission. AI outcome assessments are not independent verification. Tool discovery is limited to indexed candidates and available metadata, not a guarantee of globally optimal providers.
- Install Python artifacts from the GitHub v0.36.0-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.35.3-rc.1 - 2026-09-22

### Fixed

- Make the selected MCP server name and endpoint bold in both connection panels, with primary text contrast and wrapping for narrow screens.

### Compatibility and migration

- Backward-compatible presentation-only patch prerelease; no behavior, permission, schema or migration changes.
- Install Python artifacts from the GitHub v0.35.3-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.35.2-rc.1 - 2026-09-22

### Fixed

- Restore live Notion OAuth discovery, verified with 45 account tools. Support large MCP tool schemas without truncating their validation rules. Input and output schemas are bounded at 128 KiB and the complete catalog at 512 KiB; the 80-tool count and response limits remain enforced.
- Show OAuth progress and results directly beneath the provider connect button, with the provider name and endpoint. Restore the attempted provider after redirect, identify the target of inspection and connection, and clear stale feedback when the endpoint changes.
- After connection, show the authenticated account status and tool count; move earlier anonymous warnings into a labeled historical section while keeping behavior-verification limits visible. Disconnected accounts keep their cached catalog and timestamp without implying current access.
- Record fixed discovery failure categories without provider payloads or credentials.

### Compatibility and migration

- Backward-compatible patch prerelease; no migration or permission changes. Uses the existing SQLite Durable Object storage. AI context and action approval limits remain unchanged; large catalogs can still require selecting a narrower set of tools for a job.
- Install Python artifacts from the GitHub v0.35.2-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.35.1-rc.1 - 2026-09-22

### Fixed

- Accept OAuth token responses that omit expiration, as allowed by Notion's client contract, using a one-hour local lease. Cap longer advertised lifetimes at one year; malformed explicit lifetimes remain rejected. Expired local leases refresh or require owner reconnection.
- Distinguish authorization, token exchange, response validation, and MCP discovery failures using fixed callback messages without exposing provider errors or credentials.

### Compatibility and migration

- Backward-compatible patch prerelease for the shared OAuth pilot; no migration or new permissions. Existing grants and public/bearer connections remain compatible. Live Notion account acceptance remains pending a new owner attempt.
- Install Python artifacts from the GitHub v0.35.1-rc.1 prerelease. Hosted services deploy from the merge commit; no registry publication is implied.

## 0.35.0-rc.1 - 2026-09-22

### Added

- Owner-managed OAuth accounts for shared workspace MCP agents, with PKCE, authenticated callbacks, encrypted credentials, refresh rotation and disconnect/revocation. Operators can use shared accounts through existing action approvals and schedules; grants remain workspace-owned after the connecting member leaves.
- Explicit provider configuration with preregistered clients or public client metadata, plus a Notion demo configuration. Reconnecting or changing account capabilities invalidates agent trials and pending approvals.
- Controlled-provider security and real Worker/browser acceptance covering cross-workspace isolation, callback replay, refresh failure/concurrency, durable storage, key rotation and credential redaction.

### Compatibility and migration

- Significant functionality: minor prerelease for the new authorization boundary. Existing public and bearer connections remain compatible; OAuth adds encrypted records to existing workspace storage without a schema migration.
- OAuth is disabled by default. Configure the provider allowlist, fixed console origin, encryption keys and active key ID, then enable it explicitly. Client metadata must be publicly retrievable while callbacks remain authenticated. See `docs/oauth-connections.md` for deployment, key rotation and real-account rollout checks.
- Initial compatibility requires reviewed scopes, PKCE S256 and expiring bearer tokens. Dynamic client registration and automatic scope escalation are not included. Live Notion discovery and client registration are verified; real-account consent remains a deployment acceptance step. QuantApe currently exposes public/bearer tools without discovered MCP OAuth metadata.
- Install Python artifacts from the GitHub v0.35.0-rc.1 prerelease. Hosted services deploy from the merged commit; no package-registry publication is implied.

## 0.34.2-rc.1 - 2026-09-22

### Changed

- Make the existing MCP readiness checker available at `https://mcpcheck.agentaction.dev`, with website navigation and a homepage entry point for MCP developers.
- Replace Recipes in the primary navigation with MCP Checker; retain recipe browsing on the homepage and in the footer. Console discovery and evidence links use the branded checker domain.

### Compatibility and migration

- Backward-compatible patch prerelease; no new checker capabilities, schema, permissions, storage changes, or user migration. Existing reports, quotas, and workers.dev URLs continue to work.
- The checker remains a preview of anonymous metadata inspection; runtime behavior is untested and report publication remains optional.
- Install Python artifacts from the GitHub v0.34.2-rc.1 prerelease. Website and checker deployments use their existing hosting; no registry publication is implied.

## 0.34.1-rc.1 - 2026-09-22

### Fixed

- Restore public MCP checker form initialization in production. Disable Wrangler name-preservation helpers that cannot be referenced from the serialized browser script.
- Run readiness acceptance against the actual Wrangler bundle and execute its served JavaScript to catch missing browser helpers before deployment.

### Compatibility and migration

- Backward-compatible patch prerelease; no schema, storage, permissions or configuration migration. Existing public reports and workspace data remain valid.
- The checker continues to use system fonts and a strict CSP. Its assets do not request Soleil; no font allowlist or unrelated font asset is added.
- Reload the checker after deployment. Install Python artifacts from the GitHub v0.34.1-rc.1 prerelease; no registry publication is implied.

## 0.34.0-rc.1 - 2026-09-22

### Added

- Public MCP Readiness Check with anonymous HTTPS discovery, protocol selection, source-linked schema findings, usability guidance, metadata heuristics, JSON export and explicit opt-in publication.
- Versioned readiness profiles shared with workspace pre-checks, including a fingerprint of bounded discovered metadata, requested/observed protocol, available server identity, 24-hour freshness and explicit untested behavior/permissions/retries/conformance.
- Exact-endpoint public evidence in discovery cards and capability suggestions. Public service failures leave catalog discovery available; workspace/account observations are never published.

### Compatibility and migration

- Significant functionality: minor RC for a new public network surface and additive evidence schema. No changes to connection approval, credentials, tool execution authorization, or existing catalog storage.
- Deploy the new `agentaction-mcp-check` Worker before the operator console. Its SQLite Durable Object stores only explicitly published anonymous reports, bounded to the latest 1,000. Existing workspace inspection records remain readable; recheck to obtain readiness profiles.
- Preview limits: five requests per minute per IP, 100 new checks per UTC day across the service, and three concurrent checks. DNS validation plus the strictly public Worker network boundary blocks private destinations; probes send no credentials or tool calls.
- Inspection supports up to 80 tools and five catalog pages. Reports display up to 20 tools / 32 KB metadata and 32 findings, with omissions labeled. Fingerprints cover retained discovery metadata, not complete server implementation or backend behavior. Findings are limited checks, not an MCP conformance or safety certificate.
- Install Python artifacts from the GitHub v0.34.0-rc.1 prerelease. No PyPI or npm publication is implied; hosted services deploy from the merged commit. Local stdio, authenticated execution, model evals and automated profile refresh are outside this release.

## 0.33.0-rc.1 - 2026-09-21

### Added

- Optional Smithery and Glama directory enrichment for MCP discovery before account connection. Search locally cached tool names, descriptions and input/result schemas; show potential matching tools, fields, source links, retrieval dates and unknown/partial/stale metadata.
- Report catalog coverage per source, including Glama's traversal limit and missing configuration. Isolate source snapshots and failures; retain the last complete catalog on refresh failure. Credit Glama wherever its tool catalog is displayed.
- Keep publisher documentation as a fallback and compare indexed tool names with connected-account discovery. Advertised tools cannot create executable bindings or prove permissions, execution or result completeness.

### Compatibility and migration

- Significant functionality: minor RC for optional external catalogs and additive evidence fields. Existing official registry state, drafts, connection approvals and tool-call approvals remain valid. No new Durable Object class migration; existing storage gains a source-identity table.
- Configure `MCP_SMITHERY_API_KEY` and/or `MCP_GLAMA_API_KEY` as operator Worker secrets to enable enrichment. No credentials are needed for the existing official registry. Provider integrations are fixture-tested; live availability and coverage require configured provider credentials.
- Search pages contain up to 20 listings per configured source and advance each source by 20. Totals count listings, including duplicates across sources. Queries and tenant credentials are never forwarded to directory providers. OAuth login and automatic documentation extraction are not included.
- Install Python artifacts from the GitHub v0.33.0-rc.1 prerelease. No PyPI or npm publication is implied; the console deploys from the merged commit.

## 0.32.0-rc.1 - 2026-09-21

### Added

- Discover MCP servers within each required draft capability, including unconnected registry servers and relevant connected tools. Show match reasons, provider details and connection state, with editable searches and a connect-your-own action for every capability.
- Preserve the originating capability through server setup and return to its actual discovered tools for an explicit selection. Keep other mappings and saved field checks intact. Show actionable prompts for unmapped capabilities; expose coverage details after selection.
- Add bounded, ranked registry suggestions using published descriptions and related subject terms. Search the cached registry without forwarding draft inputs or search queries to publishers. Handle empty, stale, failed and outdated requests explicitly.

### Compatibility and migration

- Significant functionality: minor RC for an additive registry suggestion query mode and revised connection workflow. No persisted schema migration. Existing drafts and mappings remain valid, and the general registry browser retains its existing search behavior.
- Suggestions are metadata matches, not verified capability or account access. Unsupported server setup remains explicit. Endpoint approval, consent, authentication and tool-execution approval are unchanged; selecting a recommendation never connects or executes automatically.
- Install Python artifacts from the GitHub v0.32.0-rc.1 prerelease. No PyPI or npm publication is implied; the console deploys from the merged commit.

## 0.31.0-rc.1 - 2026-09-20

### Added

- Show MCP capabilities and limits in the observability console, separating public pre-check summaries from connected-account snapshots. Retain bounded result schemas, annotations, resource listings and discovery provenance; older snapshots remain unknown until refreshed.
- Assess each mapped draft step against required input/result fields, scalar example inputs and connections to earlier results. Save assessment settings with the draft and recompute declared, blocked or unknown coverage when mappings or catalogs change.
- Share 14 CLI/console acceptance fixtures and cover persistence, refresh authorization, stale mappings and desktop/mobile behavior. Catalog refresh executes no tools or resource reads and invalidates earlier approvals and activation evidence.

### Compatibility and migration

- Significant functionality: additive console fields, persisted optional metadata and a capability-refresh route; minor RC for the new storage/API boundary. Existing snapshots and drafts need no migration. Refresh connected servers to capture the new metadata; affected agents pause until a new trial.
- Assessment inputs do not configure actual tool-call arguments. Coverage is conservative schema evidence, with execution, account permissions and result completeness still unverified. Agent-profiler idea generation and existing trial approval rules are unchanged.
- Install Python artifacts from the GitHub v0.31.0-rc.1 prerelease. No PyPI or npm publication is implied; the operator console deploys from the merged commit.

## 0.30.0-rc.1 - 2026-09-20

### Added

- Capture paginated MCP tools, resources, and resource templates with bounded discovery, explicit incomplete/unknown states, catalog hashes, and server/protocol provenance. Discovery does not execute tools or read resources.
- Inspect capability schemas, declared restrictions and advisory coverage findings independently of risk scores. Evaluate explicit workflow profiles for missing fields, unsatisfied arguments and broken output-to-input bindings, with JSON/text reports and an opt-in static coverage CI gate.
- Include synthetic ticket workflow examples and acceptance fixtures. Account access and execution remain unverified; live read/write checks and capability regression comparisons are follow-up slices.

### Compatibility and migration

- Significant functionality: additive CLI commands and new versioned catalog/report/workflow formats; released as an RC for this new compatibility boundary. Existing risk analysis, fetch, check and drift commands retain their behavior. No migration is required.
- JSON Schema validation is now a runtime dependency. Static evaluation supports conservative JSON Schema 2020-12 checks; complex schemas and unsupported protocol revisions remain unknown. No external schema references are fetched, provider regexes are not executed, and discovery redirects are refused.
- Install Python artifacts from the GitHub v0.30.0-rc.1 prerelease. No PyPI or npm publication is implied; hosted services are unchanged by this release.

## 0.29.0-rc.2 - 2026-09-18

### Fixed

- Generate profiler ideas solely from the selected function/area and optional improvement context. Existing MCP tools no longer bias suggestions toward unrelated work or block discovery due to endpoint availability.
- Show abstract capability needs without server-match or missing-tool badges. Choose an idea first; discover and map MCP tools while drafting. Reject model-proposed tool bindings at the idea stage.

### Compatibility and migration

- Backward-compatible correction to the 0.29 prerelease. Capability match arrays remain present and empty; saved drafts, tool mapping, contracts, quotas and approvals are unchanged. No migration.
- Install Python artifacts from the GitHub v0.29.0-rc.2 prerelease. npm publication is unchanged; the console deploys from the merged commit.

## 0.29.0-rc.1 - 2026-09-18

### Added

- Replace generic Create example prompts with optional Help me choose an agent. Choose or type a function or area, optionally describe an improvement, and receive up to three tailored agent ideas with benefits, job descriptions and capability needs.
- Use connected tools as suggestion context while supporting empty workspaces. Choosing an idea only fills the editable job form; creating the draft, mapping tools and approving actions remain explicit steps.
- Keep suggestions ephemeral and scoped to the current workspace. Validate model output and catalog references, reject credentials, enforce operator permissions and existing suggestion/inference quotas, and discard stale responses.

### Compatibility and migration

- Additive operator-only profiler endpoint; no migration or changes to saved agents, contracts or evaluations. AI suggestions and tool matches are untested, and missing tools can be connected during draft setup. This RC covers the new inference boundary.
- Install Python artifacts from the GitHub v0.29.0-rc.1 prerelease. npm publication is unchanged; hosted console deployments use the merged commit.

## 0.28.0-rc.2 - 2026-09-18

### Fixed

- Simplify Create to one job-description form with clickable example prompts. Browse catalog and saved examples through an optional disclosure, show Continue an agent only when drafts exist, and remove the competing server-based creation section.
- Keep manual editing and Save as a template secondary. Opening examples preserves editor inputs; drafting closes secondary sections to focus the review step. Empty saved-template and suggestion sections stay hidden.

### Compatibility and migration

- Backward-compatible UX correction to the 0.28 prerelease; no API, storage, permissions or execution changes and no migration. Existing template deep links and saved drafts remain supported. Example prompts only prefill text; they never submit or execute work.
- Install Python artifacts from the GitHub v0.28.0-rc.2 prerelease. npm publication is unchanged; the console deploys from the merged commit.

## 0.28.0-rc.1 - 2026-09-18

### Added

- Create an agent before choosing MCP servers. Describe a job or use an agent template, save an unbound workspace draft, and return to finish its tools later. Create is the first lifecycle step; MCP servers live in workspace navigation.
- Map each required capability to a discovered tool and MCP account. Equivalent accounts stay unresolved; unique available matches are proposed. Browse available MCP servers or add your own from the tools editor without losing draft edits or job inputs.
- Run supervised agents across multiple MCP servers with a shared four-call budget and approval for every exact action. Contracts freeze per-tool server mappings, events retain source provenance, and evaluation checks tool scope against those sources. Reconnecting or disconnecting any mapped server pauses affected agents and invalidates trial evidence.

### Compatibility and migration

- Significant functionality: v0.28.0-rc.1 adds persisted unbound drafts, optional tool labels/bindings and source evidence. Existing single-server agents, stored recipes, API identifiers and template deep links remain compatible; no migration or retrospective rebinding. Reusable definitions are presented as agent templates.
- Proposed text and tool matches are untested suggestions. Written boundaries guide the model; mapped tool scope, exact-action approval and the total call budget are runtime-enforced. Hosted contract/evaluation records remain unsigned, and provider output is not independent verification.
- Drafts exclude stored MCP credentials and template definitions exclude account mappings and instance inputs. Discovered registry entries do not grant executable access. Existing endpoint approvals and authentication remain required.
- Install Python artifacts from the GitHub v0.28.0-rc.1 prerelease. npm publication is unchanged; the hosted console deploys from the merged commit.

## 0.27.0-rc.1 - 2026-09-17

### Added

- Describe a job once in Create to generate an editable agent draft from the selected connection's discovered tools. Prefill its name, reusable objective, instructions, expected result and standard measurable checks, while preserving the original description as instance inputs.
- Review a concise draft summary with detailed instructions, tools and evaluation controls under Customize. Ask up to three questions for missing essentials; users can mark details already supplied. Answers remain instance-only and reusable recipe saving is optional.
- Preselect a connection only when there is one matching account, including saved and catalog recipes. Review first action saves the draft and plans its trial; every tool call still requires explicit approval. Save draft only and manual authoring remain available.

### Compatibility and migration

- Significant functionality: v0.27.0-rc.1 introduces the guided draft endpoint and workflow. Existing recipe, agent and contract schemas are unchanged; no migration. Generated text is an untested, editable suggestion, not execution or independently verified evidence. Existing advanced checks and exact-action approvals retain their behavior.
- Draft generation shares the existing suggestion quota, rejects unknown tools and unsupported settings, excludes stored connection credentials, and discards stale responses when users edit or switch workspaces. Trial-start failures retain the created agent for manual retry.
- Install Python artifacts from the GitHub v0.27.0-rc.1 prerelease. npm publication is unchanged; the hosted console deploys from the merged commit.

## 0.26.0-rc.1 - 2026-09-17

### Added

- Define measurable checks inline in Create and retain them with workspace recipe revisions. Check successful tool use, absence of a tool call, and typed assertions on the latest tool call's MCP structuredContent. Completion, successful execution, selected-tool scope, recorded approval and the four-call budget are checked for every bound run.
- Hosted supervised runs can now freeze an intent contract and evaluation binding before inference. The shared intent evaluator records a deterministic result on completion, failure, cancellation and restart recovery, with profile/contract/evidence digests and per-check provenance. Existing instances keep their bound definition when recipes change; activation requires passing checks as well as the existing successful trial review.
- Inspect the same contract, criteria and result in Run, hosted Jobs and Evals. AI assessments remain separate. Missing, malformed or truncated structured output is insufficient evidence, and provider-reported fields are not independent verification.

### Compatibility and migration

- Significant functionality: 0.26.0-rc.1 for the new hosted contract/evidence binding boundary. Additive optional definition, agent and run fields; no migration or retrospective contract issuance. Enable measurable checks when creating a new agent to use the binding. Existing unbound agents and recurring checks retain their behavior.
- Hosted contracts use the public intent schemas and shared core evaluator, and remain hosted records without signed gateway receipts. External-agent gateway evaluation definitions and routing are unchanged. Written boundaries remain model instructions; this release does not turn arbitrary prose into enforced controls.
- Install Python artifacts from the GitHub v0.26.0-rc.1 prerelease. npm publication is unchanged; hosted console deploys from the merged commit.

## 0.25.0-rc.1 - 2026-09-17

### Added

- Author agent recipes directly in Create, starting from scratch, a catalog recipe, an AI suggestion or a saved workspace recipe. Edit the goal, input guidance, allowed tools, instructions, boundaries and success criteria together, then create a supervised draft with its own job inputs.
- Save private workspace recipes, reuse them with fresh inputs, duplicate them or save a new numbered revision. Existing agents retain their original definition. Stale edits fail with a reload instruction. Templates exclude account bindings and instance inputs; known workspace credentials are rejected.

### Compatibility and migration

- Significant functionality: 0.25 minor release candidate for the new persisted workspace recipe definition boundary, continuing hosted runtime operational validation. Additive storage and API; existing catalog links and agents remain compatible without migration. Owners and operators can save recipes; viewers retain read access. Up to 24 recipes and eight revisions per recipe.
- Supervised execution still uses one connected MCP server, one to four selected tools and at most four approved calls per run. Written boundaries guide the model; they do not install gateway contract controls. Success remains explicitly AI-assessed. Structured contract/eval binding, public recipe publishing and multi-server execution are outside this release.
- Install Python artifacts from the GitHub v0.25.0-rc.1 prerelease. npm publication is unchanged; hosted services deploy from the merged commit.

## 0.24.0-rc.1 - 2026-09-17

### Added

- Browse Activity by agent in compact, expandable groups, with current status, last/next execution and findings. Pending approvals and current problems sort first. Switch to a chronological list, filter by agent or execution status, and page through retained history ten executions at a time.
- Hosted Jobs projects recurring checks and supervised runs using source-qualified execution IDs. Inspect timestamps, measured duration, result, findings, recorded result digests and AI assessments where available. Activity links to the exact Job record. Existing gateway finalized receipts retain their own explorer and evidence labels.

### Compatibility and migration

- Significant user-visible execution browsing and Jobs coverage: 0.24 minor release candidate while the hosted monitoring feature remains under operational validation. No API, schema, permissions, scheduling or notification changes; no migration. Reading Jobs does not create a job or replay execution. History remains bounded by the existing 40 supervised and 80 recurring runs per workspace.
- Hosted records are labeled Recorded check or Recorded tool execution; no signed gateway receipt or independent outcome verification is implied. Receipt filters remain scoped to the gateway index.
- Install Python artifacts from the GitHub v0.24.0-rc.1 prerelease. npm publication is unchanged; hosted services deploy from the merged commit.

## 0.23.0-rc.2 - 2026-09-17

### Fixed

- Show recurring recipe instances alongside supervised agents in My agents, with latest execution, result and next schedule. Include recurring checks in Run history and expose both kinds of run in Monitor, newest first. Keep pending approvals visible beyond the recent-history limit.
- Recognize recurring-only workspaces in Overview. Show stale or unavailable monitoring coverage explicitly and keep workspace switches isolated from delayed responses. Viewing and refreshing history performs no agent actions.
- Backward-compatible console discoverability fix continuing the 0.23 release candidate. No API, schema, permission, notification or scheduling changes; no migration. Operational checks remain distinct from signed Jobs and AI-assessed outcomes. Install Python artifacts from the GitHub v0.23.0-rc.2 prerelease; npm publication is unchanged. Hosted console deploys from the merged commit.

## 0.23.0-rc.1 - 2026-09-15

### Added

- Reusable recurring-agent handlers with owner-approved intervals, durable baselines, run evidence, restart recovery, findings and acknowledge/resolve/reopen transitions. An observed outage is a completed monitoring run with a finding; stale or incomplete checks remain unknown.
- Workspace email notification settings: private recipients, severity routing, daily digests, UTC quiet hours, weekly summaries, per-agent recipient subsets, test messages and bounded durable delivery retries/history. Existing supervised MCP agents publish privacy-safe approval/failure events to the same service after their next authenticated mutation.
- Website Health sample recipe using public HTTPS checks and daily title, description, canonical and noindex comparisons. Configure arbitrary targets; no customer domains or recipients are embedded in the product. Two consecutive failures confirm a single-location incident. Full-site crawls, regional confirmation, Search Console and PageSpeed are not included in this slice.
- Authenticated Recurring agents and Workspace notifications screens with baseline review, explicit activation, pause, findings and delivery evidence. Public recipe adoption routes to this shared runtime.

### Compatibility and migration

- Significant functionality: new 0.23 minor release candidate because unattended execution and persisted state add an operational boundary. Existing supervised MCP agents remain compatible. Additive `RecurringWorkspace` SQLite Durable Object migration and email binding; no existing workspace data is rewritten. Sender-domain provisioning and private workspace recipients are required for delivery.
- Retained runs are operational observations with result digests, not signed gateway Jobs or independently verified SEO outcomes. Email delivery is at-least-once; provider acceptance does not prove inbox receipt.
- Install Python artifacts from the GitHub v0.23.0-rc.1 prerelease. npm package versions/publication are unchanged. Hosted services deploy the merged commit separately.
- Add an HTML parser for accurate metadata inspection and apply compatible security updates to console development tooling.

## 0.22.0-rc.3 - 2026-09-14

### Added

- Consolidate recipe adoption into Create. Public recipe pages open the same pinned catalog recipe in the console; review requirements, connect a missing MCP server, choose its connection, and configure a draft without generating AI suggestions. Preserve recipe selection across sign-in reload, workspace changes and workspace setup while clearing private draft inputs when switching workspaces.
- Save recipe instructions, boundaries, requirements and version with each draft. The server resolves recipe content from the catalog and validates the selected connection’s discovered tools. Creation performs no inference or tool execution; trials retain approval before each call.
- Show hosted limitations explicitly: one server per agent, four calls per run, no cross-run baseline or arbitrary file storage. Multi-server recipes remain inspectable/exportable but cannot create a hosted instance yet. Fixture evidence remains separate from live trial outcomes.
- Significant functionality continuing the 0.22 minor release candidate. Optional recipe metadata is additive; existing agents and suggestion-based creation remain compatible, with no storage migration or new bindings. Install Python artifacts from the GitHub v0.22.0-rc.3 prerelease; npm publication is unchanged.

## 0.22.0-rc.2 - 2026-09-14

### Fixed

- Separate Workspace settings from the numbered agent lifecycle, with a dedicated utility destination on both console and builder. Overview remains the progress home and guides new users into workspace setup. Existing setup and invitation URLs keep working, including the selected workspace.
- Label tool connections MCP servers. Show server endpoints and tools separately from stored account credentials; servers without stored credentials are not assumed to be public.
- Backward-compatible correction within the v0.22.0 candidate series. No API, schema, authorization, dependency or storage change. Install Python artifacts from the GitHub v0.22.0-rc.2 prerelease; npm publication is unchanged.

## 0.22.0-rc.1 - 2026-09-14

### Added

- Restructure AgentAction into Overview, Connect, Create, Run, Monitor and Improve. The home screen shows workspace progress and a next action; the builder separates provider setup, agent creation, and supervised execution into focused screens. Monitor brings together activity, finalized jobs and execution quality; Improve holds evals.
- Preserve existing setup, activity, jobs, eval and job-detail routes. Fleet quality moves to Monitor → Quality. Cross-screen links carry the selected authorized workspace. Missing progress data stays unknown and the public demo keeps management actions unavailable.
- Minor release candidate continuing console/runtime validation. No schema, authorization, dependency or storage migration. Install Python artifacts from the GitHub v0.22.0-rc.1 prerelease; npm publication is unchanged.

## 0.21.0-rc.1 - 2026-09-14

### Added

- Separate Browse servers and MCP connections views with preserved search filters and pagination. Selecting a server opens focused setup with automatic credential-free pre-checks; valid manual endpoints are checked after a short pause. Findings remain visible alongside approval and connection actions, with local errors and recovery controls.
- Reuse recent workspace reports for the exact endpoint and requested protocol for one hour, deduplicate concurrent automatic checks, and offer an explicit Recheck. Cached checks consume no new outbound probe or daily allowance; the 30-probe daily limit and all public-endpoint, credential-exclusion and role checks remain in force.
- Minor release candidate for the new default inspection behavior and additive `force` request / `requestedProtocol` report fields. Older reports remain readable but refresh before cache reuse. No new bindings or destructive migration; existing connections remain compatible. Install Python artifacts from the GitHub v0.21.0-rc.1 prerelease; npm publication is unchanged.

## 0.20.0-rc.1 - 2026-09-14

### Added

- Run a credential-free endpoint pre-check before approving or connecting an MCP provider. Registry cards and manual entry lead to prominent, saved workspace findings with the exact endpoint, observation time, OAuth discovery, provider metadata, advertised/challenged scopes, public tool descriptions, HTTP evidence and explicit uncertainty.
- Discover OAuth independently of connection support. OAuth login remains unsupported; no client registration, consent flow, tokens, AI inference or tool execution occurs during inspection. Public tool listings do not establish authorization for tool calls or provider trust.
- Owners/operators can run up to 30 pre-checks per workspace per day; retain the latest report per endpoint, up to 32. Viewers can read reports. Each outbound destination is validated as public HTTPS with redirects blocked, bounded DNS and response reads, a 30-second deadline and 16-request limit. Inspection never changes endpoint approval or creates a connection.
- Minor release candidate for the new inspection API and outbound metadata discovery. No new binding or destructive migration; existing connections remain compatible. Existing registry snapshots gain additional inspectable URLs on their normal refresh. Install Python artifacts from the GitHub v0.20.0-rc.1 prerelease; npm publication is unchanged.

## 0.19.0-rc.1 - 2026-09-13

### Added

- Filter My Agents registry results by declared API keys, Authorization headers, other secret inputs or Not specified, alongside capability and text search. Result cards show the declared authentication labels; filters remain consistent across pagination.
- Authentication metadata describes advertised configuration, including optional credentials and local packages. Missing metadata does not mean public access. The registry has no standard pricing field; check provider documentation for costs and actual authentication requirements.
- The catalog API accepts optional `auth` and returns additive authentication metadata. Cached listings remain readable as Not specified until their normal hourly refresh; no storage migration, new bindings or connection authorization changes are required.
- Install Python artifacts from the GitHub v0.19.0-rc.1 prerelease. This minor release continues the console/runtime release-candidate validation period. npm versions and publication are unchanged.

## 0.18.0-rc.4 - 2026-09-13

### Fixed

- My Agents now shows the signed-in account, selected workspace role, Log out and Workspace setup in a persistent account section. Roles come from workspace membership; switching accounts does not assign a new role.
- Expired or unverifiable sessions clear the visible connection forms and hide protected controls, with a Sign in link back to My Agents. API authentication redirects are handled explicitly instead of leaving a confusing failed request.
- Install Python artifacts from the GitHub v0.18.0-rc.4 prerelease. No migration, dependency update, authorization-policy change or npm publication is required.

## 0.18.0-rc.3 - 2026-09-13

### Fixed

- Show actionable connection blockers immediately beside Connect: missing endpoint, owner approval or view-only access. Disabled My Agents buttons now show an unavailable cursor. A busy cursor and accessible busy state appear only while a request is running, so missing endpoint approval no longer looks like a stuck connection.
- Serve the product favicon from the console origin, including the legacy favicon.ico URL, and add explicit icon links to the console and My Agents pages.
- Mark console HTML as private, non-cacheable and no-transform to prevent automatic edge script injection that conflicts with the existing same-origin CSP. System fonts and script/network restrictions remain unchanged; browser-extension fonts are not added to the allowlist.
- Install Python artifacts from the GitHub v0.18.0-rc.3 prerelease. This continues the v0.18.0 release candidate; no migration, dependency update or npm publication is required.

## 0.18.0-rc.2 - 2026-09-12

### Fixed

- Cached MCP Registry cards now display current workspace-owner approval guidance immediately after deployment, without waiting for a catalog refresh. Provider metadata and endpoint authorization are unchanged.
- Install Python artifacts from the GitHub v0.18.0-rc.2 prerelease. This continues the v0.18.0 authorization release candidate; no migration or npm publication is required.

## 0.18.0-rc.1 - 2026-09-12

### Added

- Show whether each MCP Registry endpoint is enabled for the selected workspace. Owners can review and approve an exact public HTTPS URL directly in Connection details; operators can connect after approval.
- Persist workspace approvals with owner identity and timestamp. Removing workspace access clears affected connection credentials, pauses agents and cancels pending runs, unless deployment-managed access still enables that URL.

### Security and compatibility

- Approval validates public DNS without contacting the MCP server or sending credentials. Workspace-approved destinations are checked before every MCP request, including session cleanup; private/reserved addresses, ambiguous URLs, redirects and unresolved DNS are blocked. The console uses Workers global fetch with `global_fetch_strictly_public` as the network boundary.
- Current server-side workspace membership controls approval and removal. Approvals are isolated per workspace, limited to 32 entries and 30 validation attempts per day. Existing deployment-managed endpoint access remains supported; no storage migration or new bindings are required.
- This release candidate changes outbound endpoint authorization and requires operational validation before stable promotion. OAuth-only servers, local stdio and private-network MCP endpoints remain unsupported.
- Install Python artifacts from the GitHub v0.18.0-rc.1 prerelease. npm package versions and registry publication are unchanged.

## 0.17.0-rc.1 - 2026-09-12

### Discover MCP servers during onboarding

- Search the official MCP Registry by server name, description or advertised capability, with category filters, paged results and provider setup links in My Agents.
- Prefill supported remote endpoints while preserving manual HTTPS entry, administrator endpoint allowlists, credential consent, live tool inspection and supervised execution. Catalog capabilities are advertised metadata, not verified tool availability.
- Add a shared SQLite-backed McpRegistry catalog with hourly background refresh, cursor pagination, explicit cold-index and stale/error states, and atomic snapshot replacement. Search queries and account credentials are never sent to the registry.
- Release candidate for the new console Durable Object migration and ongoing agent runtime RC. Add the MCP_REGISTRY binding and mcp-registry-v1 migration when deploying the console from main. Existing tenant, agent, gateway and receipt schemas remain compatible; no data migration is needed for existing workspaces. OAuth-only and local stdio connections remain unsupported.
- Install Python artifacts from the GitHub v0.17.0-rc.1 prerelease. npm package versions and registry publication are unchanged.

## 0.16.0-rc.1 - 2026-09-12

### MCP agent instances

Release candidate for the new runtime storage migration and AI execution surface.

- Add an authenticated My Agents builder: connect an approved HTTPS MCP endpoint with optional bearer credentials, discover tools and generate agent suggestions with Workers AI.
- Create persistent workspace-scoped instances, run trials with exact-call approvals, inspect tool execution evidence and separate AI outcome assessments, and activate or pause daily supervised schedules.
- Keep credentials server-side; support replacement/disconnection, bounded model/tool usage, catalog drift checks, and interruption records without automatic replay of uncertain external effects.
- Add website and catalog entry points while preserving recipe downloads and the existing observability views.
- Add the AgentWorkspace Durable Object migration and AGENT_AI binding to the operator console. Public demo remains fixture-only. Firecrawl is the default enabled endpoint; administrators can configure exact additional HTTPS endpoints. OAuth-only and stdio MCP transports are not included.
- Additive runtime and UI capability; no existing gateway API, receipt or recipe-schema changes. Deploy the console migration/bindings from main; install Python artifacts from the GitHub v0.16.0-rc.1 prerelease. npm packages retain their existing versions.

## 0.15.4 - 2026-09-11

### Homepage positioning

- Lead with connecting agents to tools safely and reliably, supported by recipes, evaluation against the job, and ongoing visibility and control.
- Align homepage metadata and introductory copy while retaining observation onboarding, detailed platform capabilities and the lower-page recipe CTA.
- Backward-compatible copy update; no API, schema or migration changes. Install the Python wheel or source distribution from the GitHub v0.15.4 release; npm versions unchanged.

## 0.15.3 - 2026-09-11

### Homepage recipe entry

- Add a hero link and compact recipe CTA near the bottom of the homepage, featuring existing pricing, support and incident recipes with provider names drawn from the catalog.
- Connect the platform story to agent creation and evaluation, with a direct recipe entry and clear starter/runtime scope alongside decision assurance and action authorization.
- Preserve observability onboarding and distinguish synthetic starter cases from live-agent validation.
- Backward-compatible presentation/navigation update; no API, schema or migration changes. Install the Python wheel or source distribution from the GitHub v0.15.3 release; npm versions unchanged.

## 0.15.2 - 2026-09-11

### Catalog presentation

- Remove the secondary maintainer footer from recipe tiles, retaining provider attribution on cards and recipe maintenance on detail pages.
- Backward-compatible presentation fix; no API, schema or migration changes. Install the Python wheel or source distribution from the GitHub v0.15.2 release; npm versions unchanged.

## 0.15.1 - 2026-09-11

### Catalog presentation

- Make recipe cards more compact with three wide-screen columns, two medium-screen columns and one phone column; retain full titles, summaries and evidence labels.
- Lead provider-backed cards and detail pages with the connected server names, and label recipe maintenance separately. Generic synthetic entries retain a Required servers label.
- Backward-compatible presentation fix; no API, schema, runtime or migration changes. Install the Python wheel or source distribution attached to the GitHub v0.15.1 release; npm versions are unchanged.

## 0.15.0 - 2026-09-11

### Practical agent recipes

- Add AgentAction-maintained recipes for competitor pricing changes (Firecrawl), recurring support questions to draft articles (Intercom), and production errors to reviewed engineering tickets (Sentry and Linear).
- Include optional documented connections, access instructions, inputs, runtime requirements, synthetic example outputs and sandbox test procedures on recipe pages and in portable downloads.
- Add failure fixtures for incomplete retrieval, billing mismatch, privacy, approval, duplicate creation and destination verification. Record a public Firecrawl connection/retrieval probe separately from live agent validation.

### Compatibility and installation

- Recipe schema v1 and starter format v1 remain supported; metadata additions are optional and existing entries retain their behavior. No migration is required.
- Accounts, snapshot storage, scheduling, approval enforcement and independent evaluation remain runtime setup steps. This release does not deploy an agent or certify live performance.
- Install the Python wheel or source distribution attached to the GitHub v0.15.0 release. npm package versions are unchanged and no registry publication is implied.

## 0.14.0 - 2026-09-11

### Agent recipe directory

- Add a public recipe directory with search, action-scope filters, shareable detail pages, explicit MCP tool requirements, operating boundaries, and inspectable synthetic outcome checks.
- Add downloadable versioned recipe bundles and agent instructions, plus a recipe-aware handoff to authenticated console setup, Jobs, and Evals.
- Add reviewed provider submissions, a documented recipe format, deterministic validation and fixture checks. Initial recipes are attributed to AgentAction; fixture evidence is explicitly distinct from live agent testing.
- Apply website production dependency security fixes identified during release validation.

Compatibility: additive website and console capabilities. Existing agent, authorization and evidence contracts are unchanged. Recipe bundles are portable starter documents, not runtime configuration or deployed agents; controls and Evals must be configured in the target environment. No data migration is required.

Installation: `python -m pip install agentaction-dev==0.14.0` when available in your configured index, or install the wheel attached to this GitHub release. Hosted services deploy from the tagged source's merged commit; registry publication is separate.

## 0.13.1 - 2026-09-03

### Mixed-history eval routing

- Allow `refund_triage.v2` to route Hermes source-and-agent targets that also
  contain older lifecycle-only Jobs, without deleting or reclassifying that
  history.
- Keep declared evidence self-attested, while Jobs without semantic claims
  freeze the selected evaluation and report insufficient evidence instead of
  blocking the assignment or inventing a pass.
- Preserve fail-closed assignment checks for genuinely incompatible evaluator
  and traffic combinations, with matching console preview guidance.
- Present the deterministic criterion aggregate as the canonical eval verdict,
  separately from the agent-reported lifecycle outcome and the legacy intent-
  profile diagnostic, so a passing six-criterion eval is never mislabeled as
  failed by the older profile score.
- Add explicit `eval_verdict` and `legacy_profile_result` read-model fields
  while preserving existing receipt fields and rejecting mismatched criterion
  provenance instead of silently promoting it.

## 0.13.0 - 2026-09-02

### Explainable workspace evaluations

- Add an immutable refund-triage evaluation specification with explicit,
  criterion-level pass, fail, and insufficient-evidence results plus bounded
  explanations, evidence references, aggregate thresholds, and frozen
  evaluator provenance.
- Let the maintained Hermes integration report bounded evidence for the six
  refund-triage criteria, bound to the active Job and labeled **Self-attested
  by agent · not independently verified** throughout storage and the console.
- Reconcile provider usage by distinguishing uncached input, cached input,
  output, and total tokens without inventing missing counters or double
  counting provider-reported cache usage.
- Make eval assignment safer with workspace-scoped source and agent choices,
  effective-route previews, and compatibility or coverage warnings before an
  owner saves a route.
- Keep Job detail reachable from Job rows and supported deep links with a clear
  workspace-preserving return path, while removing it from permanent
  navigation.
- Preserve v1 definitions and historical finalized Jobs through additive
  fields; existing workspaces require no migration. This release does not add
  a general-purpose rubric builder or independent model judge.

## 0.12.0 - 2026-09-02

### Workspace eval routing

- Add tenant-scoped, immutable eval definitions and owner-managed assignments
  with exact source-and-agent, agent, source, and workspace-default precedence.
- Freeze the resolved eval version, profile digest, and assignment on Job start
  so route changes affect only later Jobs and unlike versions remain separate.
- Add an **Evals** workspace view plus eval identity and route provenance in
  Jobs and Job detail, while keeping sources independent from evaluation setup.
- Make the trust boundary explicit: v1 versions the existing deterministic
  observed-lifecycle or agent self-attestation evaluators and does not claim an
  arbitrary rubric, LLM judge, or independent outcome evidence.
- Use `observability-console.agentaction.dev` as the canonical protected
  operator-console URL while retaining the underlying Worker deployment.

## 0.11.0 - 2026-09-02

### Model and token usage for Hermes observability

- Show provider/model names and clearly labeled estimated or actual token
  counts on model-request Activity events.
- Aggregate provider-reported input, output, and total tokens into immutable
  Hermes Jobs, with request coverage and a bounded per-model breakdown in Job
  detail.
- Preserve the existing privacy boundary and fail-open behavior: no prompts or
  responses are captured, missing usage remains unavailable, and existing
  integrations and finalized Jobs require no migration.

## 0.10.1 - 2026-09-01

### Reliable Hermes activity and support-triage demo

- Give every emitted Hermes observation a unique, retry-stable event ID and
  discard legacy conflicting duplicates so one poisoned record cannot block
  the Activity retry spool.
- Add a synthetic, read-only refund-triage workflow with eligible and
  manual-review cases, bounded policy rules, expected outcomes, and fixture
  validation for meaningful intent and eval demonstrations.
- Preserve the existing Hermes observation schemas, gateway contract, privacy
  boundary, and configuration; existing installations require no migration and
  can update the AgentAction Hermes plugin in place.

## 0.10.0 - 2026-09-01

### Agent-declared intent for Hermes

- Add opt-in Hermes context injection and structured declaration/outcome tools
  without exporting prompts, histories, tool arguments/results, or responses.
- Evaluate bounded declarations under the server-owned
  `agentaction_declared_intent.v1` profile while preserving observed-execution
  fallback and fail-open agent behavior.
- Label declarations and outcome reports as agent-generated self-attestation in
  Jobs and Job detail rather than trusted user intent or independent evidence.

## 0.9.10 - 2026-09-01

### Pending workspace invitations

- Show owners pending and expired workspace invitations alongside active Team
  members, including the invited role and expiration state.
- Keep invitation listings tenant-scoped and owner-only without returning
  one-time codes or secret digests.
- Backfill the tenant invitation index on first read so existing invitations
  appear without being sent again.

## 0.9.9 - 2026-08-31

### Workspace-stable Job detail links

- Preserve an authorized workspace across in-app Job navigation, reloads, and
  shared Job-detail URLs without treating the client preference as authority.
- Keep server-side membership authorization as the source of truth and fall
  back safely when a requested workspace is not one of the signed-in user's
  memberships.

## 0.9.8 - 2026-08-31

### Hermes runs in Jobs

- Finalize completed Hermes turns/runs as immutable, source-scoped Jobs under a
  server-owned observed-execution lifecycle profile.
- Keep source credentials write-only and bound to their registered tenant,
  source, and agent while making lifecycle retries deterministic.
- Label observed-execution Jobs separately from explicit semantic intent in the
  operator console and continue excluding prompts, arguments, and results.

## 0.9.7 - 2026-08-31

### Hermes plugin installation compatibility

- Make the AgentAction native plugin installable by the current official
  Hermes Agent release while preserving its v1 runtime hook contract.
- Keep the existing fail-open, privacy-safe shadow observability behavior and
  require no migration for existing deployments.

## 0.9.6 - 2026-08-31

### Workspace-aware activity filters

- Make disabled agent sources visibly revoked and remove token actions that no
  longer apply after disablement.
- Populate the Activity agent filter from the selected workspace's configured
  agent IDs, clearing selections that belong to another workspace or name a
  source instead of an agent.
- Label the exact-match Tool filter as optional and distinguish an unconnected
  event stream from a filtered query with no matches.

## 0.9.5 - 2026-08-31

### Focused operator overview

- Keep the synthetic nine-stage execution walkthrough in the public demo while
  removing it from authenticated operator consoles.
- Allow the shared console client to initialize and navigate when the optional
  demo lifecycle panel is absent.

## 0.9.4 - 2026-08-31

### Connected workspace setup hierarchy

- Put current-workspace connection, ingestion, and team setup ahead of actions
  for creating or joining another workspace.
- Collapse invitation redemption into a compact **Join another workspace**
  control for connected identities while keeping full onboarding visible for
  first-time users.

## 0.9.3 - 2026-08-31

### Reliable workspace invitation links

- Carry only a random, non-secret invitation identifier through Cloudflare
  Access so protected email links can auto-redeem after sign-in.
- Remove the identifier from browser history before redemption, bind the join
  to the exact verified invitee email, and preserve expiry and one-time use.
- Keep secret-bearing manual codes and previously issued fragment links as
  fallbacks.

## 0.9.2 - 2026-08-31

### Compact responsive header

- Keep the console brand, compact GitHub link, and account controls on one row
  at laptop and tablet widths instead of stacking the entire header.
- Use a two-row phone treatment and reserve full account stacking for very
  narrow screens, substantially reducing the space before console content.

## 0.9.1 - 2026-08-31

### Console account controls

- Added a same-origin Cloudflare Access logout action for operators who need to
  authenticate with another identity; the public demo keeps it hidden.
- Grouped workspace count, selection, management, identity, and session actions
  into a responsive account panel while keeping repository navigation separate.

## 0.9.0 - 2026-08-31

### Workspace invitation onboarding

- Deliver owner-created viewer/operator invitations through Cloudflare Email
  Service with workspace, inviter, role, expiry, Access sign-in guidance, and a
  one-time fallback code.
- Auto-redeem protected invitation links after Cloudflare Access authenticates
  the exact invited email, while removing the secret-bearing fragment before
  any redemption request.
- Preserve invitations and expose manual fallback instructions when email
  delivery is unavailable or fails.
- Restrict additional workspace creation to existing workspace owners while
  still allowing an identity with no memberships to create its first workspace.
- Show integration-specific Hermes or generic AgentAction connection steps in
  the operator console.

## 0.8.1 - 2026-08-31

### Workspace adoption

- Persist directory-mode state on the adopted principal membership so a fresh
  production session reliably enables workspace switching after adoption.
- Upgrade an already-adopted owner membership idempotently when the owner
  repeats the action; the mode remains scoped to the exact Access issuer and
  subject.
- Make the hosted SaaS console explicitly directory-backed so a legacy static
  tenant variable preserved by Cloudflare deployment settings cannot keep the
  workspace selector pinned.

## 0.8.0 - 2026-08-31

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.8.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing SSO-pinned tenant claims remain fixed until an owner explicitly
  enables workspace switching. The one-way adoption preserves the existing
  manifest, sources, credentials, and activity data.
- Existing tenant/source API names and `agentpass.*` protocol identifiers remain
  compatible. npm packages retain their independent versions.

### Workspace switching and agent connections

- Added an always-visible authenticated workspace control and directory-backed
  switching among only the operator's server-authorized memberships.
- Added an owner-only UI action that adopts the current SSO-pinned workspace as
  a directory-owned membership. Migration is idempotent and scoped to the
  verified Access principal; other identities remain pinned.
- Kept create and invitation-redeem actions available after a workspace is
  selected so operators can manage multiple workspaces without changing Access
  configuration.
- Generalized Connect agents so workspace creation is framework-neutral.
  Hermes is the first named integration, alongside a generic AgentAction source,
  and integration configuration is shown only after a source is selected.

## 0.7.0 - 2026-08-31

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.7.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing enforcement, shadow Activity, intent assurance, signed tenant
  claims, and versioned `agentpass.*` protocol identifiers remain compatible.
  Existing single-tenant consoles can keep `CONSOLE_STATIC_TENANT_ID`; SaaS
  deployments omit it and use directory-backed memberships.
- The console's service credential should now match the gateway's separate
  `AGENTID_INTERNAL_SERVICE_TOKEN`. `AGENTID_GATEWAY_TOKEN` remains a console
  compatibility alias. npm packages retain their independent versions.

### Self-service observability SaaS

- Added a durable tenant directory with isolated tenant records, owner,
  operator, and viewer memberships, email-bound expiring single-use
  invitations, and signed-claim compatibility.
- Added private internal-service-only tenant provisioning and activity-source
  lifecycle APIs. Tenant creation returns the first source secret once;
  rotation invalidates the prior token, disabling stops new ingestion, and only
  SHA-256 secret digests are persisted.
- Added an Access-authenticated Setup view for tenant creation, invitation
  redemption, tenant switching, Hermes configuration, ingestion-health checks,
  role-aware source controls, invitations, and members. The public demo cannot
  call any onboarding route.
- Renamed the general console chrome to **AgentAction Observability**. Activity
  remains the operational surface, while intent contracts and finalized Jobs
  remain the explicit intent-relative assurance surfaces.

## 0.6.0 - 2026-08-31

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.6.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing enforcement, MCP observe mode, intent assurance, operator-console
  authentication, and versioned `agentpass.*` protocol identifiers remain
  compatible. No migration is required.
- npm packages retain their independent versions and are not republished by
  this repository release.

### Hermes shadow observer

- Added a native Hermes plugin with fail-open model, tool, API, and subagent
  lifecycle hooks, stable Hermes correlations, counterfactual tool decisions,
  bounded asynchronous batching, and a profile-scoped retry spool.
- Excluded prompts, messages, tool arguments, terminal commands, tool results,
  provider bodies, and subagent goals/summaries from the exported schema.
- Added optional explicit intent ID/digest binding. Unbound traffic stays named
  as unbound; prompt text and model-generated goals are never promoted into
  authoritative intent.

### Multi-tenant activity observability

- Added tenant- and source-scoped hashed ingestion credentials, strict batch
  and event validation, bounded payloads and retention, idempotent replay, and
  conflict rejection in tenant-isolated durable stores.
- Added a tenant-scoped Activity API and an Access-protected Activity console
  with bounded agent, event, tool, shadow-decision, execution, and explicit
  intent-binding filters.
- Kept browser routes read only and ingestion credentials server-side. The
  public console demonstrates Activity with synthetic fixtures only and has no
  live gateway binding or credential.

## 0.5.0 - 2026-08-30

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.5.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing operator-console authentication, tenant isolation, gateway routes,
  schemas, CLI behavior, package aliases, and versioned `agentpass.*` protocol
  identifiers remain compatible. No migration is required.
- npm packages retain their independent versions and are not republished by
  this repository release.

### Public observability demo

- Added a separately deployable public observability console backed only by
  bundled synthetic fixtures, with no production service binding, gateway
  credential, tenant selection, audit routes, or approval routes.
- Reused the production Fleet Overview, finalized Jobs explorer, Job detail,
  filters, and deterministic evidence timeline without weakening the existing
  Cloudflare Access-protected operator console.
- Added automated boundary coverage and independent Wrangler configuration for
  the public Worker.
- Surfaced the public demo and protected operator sign-in in the main README,
  console documentation, and AgentAction.dev while keeping richer OpenTelemetry
  causal correlation labeled as roadmap work.

## 0.4.0 - 2026-08-26

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.4.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- MCP gateway enforcement remains the default. Observe mode is explicitly
  enabled with `"mode": "observe"`, so existing configurations require no
  migration.
- Existing `agentpass` and `agentid` CLI aliases, Python import paths,
  AgentPass-named public API aliases, and versioned `agentpass.*` protocol
  identifiers remain compatible.
- npm packages retain their independent versions and are not republished by
  this repository release.

### MCP gateway onboarding and policy testing

- Added a passive observe mode to the reference MCP gateway adapter. It uses the
  local stateful guard to evaluate representative traffic without filtering
  tool discovery, blocking tool calls, calling hosted authorization, consuming
  hosted approval or JIT state, or attaching provider receipts.
- Added privacy-safe `agentaction.mcp.observation` events with evaluation status,
  counterfactual allow, deny, or challenge decisions, normalized findings, and
  downstream outcome while excluding raw tool arguments and results.
- Made observe mode isolate missing identity, missing mappings, local evaluator
  failures, and caller-provided log-sink failures so onboarding traffic remains
  transparent. Enforce mode retains its existing fail-closed behavior.
- Added regression coverage for transparent request forwarding, stateful
  duplicate detection, identity and mapping failures, evaluator isolation, no
  hosted authorization or receipt mutation, and existing enforcement behavior.
- Added a runnable `npm run demo:observe` example and documented the deliberate
  transition from representative observation to enforcement.

## 0.3.0 - 2026-08-25

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.3.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing `agentpass` and `agentid` CLI aliases, Python import paths,
  AgentPass-named public API aliases, and versioned `agentpass.*` protocol
  identifiers remain compatible. No migration is required for existing users.
- npm packages retain their independent versions and are not republished by
  this repository release.

### Project identity

- Renamed the project, repository references, Python distribution metadata, primary CLI,
  GitHub Action, active documentation, and public APIs to AgentAction to align
  with [AgentAction.dev](https://agentaction.dev/).
- Retained the `agentpass` and `agentid` CLI aliases, AgentPass-named public API
  aliases, existing Python import paths, and versioned `agentpass.*` protocol
  identifiers for compatibility.
- Chose the collision-free `agentaction-dev` Python distribution name because
  the bare `agentaction` name is already owned by an unrelated PyPI project.

### Hosted observability console

- Added a dedicated Cloudflare Worker UI/BFF foundation with verified Access
  JWT identity, signed tenant-claim isolation, a private gateway service
  binding, read-only route/query allowlists, sanitized freshness states, and no
  browser-visible gateway credentials.
- Added an accessible responsive console shell, production and fail-closed
  local-development configuration, security-boundary tests, conditional
  Cloudflare deployment workflow, and operator setup and smoke-check guidance.
- Added the profile-scoped Fleet Overview with bounded UTC and
  profile/agent/verdict/constraint filters, separate immutable profile groups,
  outcomes, constraints, evidence confidence, execution discipline, query
  coverage, exclusions, and explicit small-sample and data-quality findings.
- Added normalized freshness age metadata, loading/empty/partial/stale/error
  presentation, a two-version support-refund fixture server, safe-rendering and
  interaction tests, and desktop/narrow-width runtime verification.

### Intent assurance

- Added privacy-safe `agentpass.decision-basis.v1` records, deterministic
  gateway policy bases, opt-in practitioner prompt guidance, and immutable
  `agentpass.intent-evidence-snapshot.v2` finalizations while retaining the V1
  snapshot schema for compatibility.
- Added tenant-scoped `agentpass.intent-quality-rollup.v1` aggregation over
  immutable final receipts, with bounded windows, exact profile-version/digest
  grouping, agent/verdict/compliance filters, group pagination, explicit
  exclusions, minimum-sample findings, confidence distributions, and
  execution-discipline metrics.
- Added frozen, tenant-scoped `agentpass.intent-profile.v1` definitions with
  canonical profile digests, typed variables, deterministic contract issuance,
  trusted-observation requirements, version lifecycle reads, and a reference
  `support_refund.v1` profile.
- Added `registered_profile_required` and `raw_compatible` tenant issuance
  modes, profile version/digest propagation on contracts and evaluation
  receipts, TypeScript client methods, and audit events for profile
  registration and issuance replay.
- Added versioned schemas for immutable per-job intent contracts and
  post-execution intent evaluation receipts.
- Added canonical intent hashing, typed deterministic predicates, evidence
  binding, outcome and constraint evaluation, execution-discipline metrics,
  and explicit indeterminate results for missing evidence.
- Bound optional intent identifiers and digests through guard decisions,
  approval evidence, local and hosted execution receipts, the TypeScript
  client, and MCP gateway authorization receipts.
- Added a runnable `support_refund.v1` intent demo and tests for completed,
  partial, noncompliant, indeterminate, and tampered-contract cases.
- Added a tenant-scoped hosted intent registry that canonically binds and
  freezes contracts, with idempotent registration and lifecycle reads.
- Made hosted intent-bound approval, JIT, authorization, and execution paths
  fail closed for incomplete, unknown, altered, expired, or job-mismatched
  contracts while preserving compatibility for unbound calls.
- Added durable decision, execution-receipt, observation, and job evidence plus
  a hosted evaluation endpoint and intent-filtered audit events.
- Replaced the Node-only intent hashing dependency with a portable synchronous
  SHA-256 implementation shared by local and Cloudflare runtimes.
- Added tenant-scoped trusted observation policies by issuer, intent profile,
  predicate, and verification method, with OIDC identity binding and RS256/JWKS
  signed-envelope verification.
- Added stable observation IDs, canonical payload digests, stored verification
  provenance, freshness enforcement, machine-readable failure reasons, and
  development-only unsigned input behind an explicit opt-in.
- Made exact observation retries idempotent without increasing evidence counts,
  rejected changed payloads under the same ID, ignored unverified observations
  during evaluation, and added value-redacted accepted/rejected/replayed audit
  events.
- Added preview and final intent-evaluation lifecycle APIs, canonical immutable
  evidence snapshots with per-source IDs/counts/digests, deterministic final
  receipts, idempotent finalization, evaluation history reads, and fail-closed
  late-evidence rejection.

### Provider trust gate

- Added hosted provider authorization receipts signed as RS256 JWS tokens on
  successful `/authorize` decisions when receipt signing is configured.
- Added public hosted JWKS endpoints at `/.well-known/jwks.json` and `/jwks`.
- Added Worker tests that verify receipt signatures, active `kid` selection,
  key-rotation JWKS publication, issuer/audience claims, grant-bound expiry, and
  request-digest binding.
- Updated the TypeScript SDK response type for hosted authorization receipts.

### Production deploy action gate

- Added hosted constraint enforcement for tool `required_context` and
  `allowed_values`.
- Added `POST /github-actions/dispatch` to authorize a scoped DevOps action,
  dispatch the bound GitHub Actions workflow, record the provider result, and
  replay identical retries without another dispatch.
- Added hosted production deploy and rollback tests covering read-only
  inspection, missing change request denial, production-only deploy scope,
  approval-bound commit drift denial, rollback-plan drift denial, JIT issuance,
  GitHub workflow dispatch, provider result recording, cached retry replay, and
  correlated audit events.
- Updated the approval inbox preview with structured deploy and rollback
  evidence bound to service, branch, commit, change request or incident,
  rollback plan, workflow, and idempotency key.

### Hosted PII egress gate

- Added hosted data-flow enforcement for classification, destination type,
  external domain, field set, record count, redaction state, and retention
  context.
- Added flow-level blocked-field, allowed-domain, max-record,
  allowed-redaction-state, and approval challenge handling for email, webhook,
  browser-form, model-provider, and file-export PII paths.
- Bound non-JIT approved hosted actions to approval evidence and request digest
  so changed domains or field sets fail closed.
- Added a preview PII egress review item to the hosted approval inbox.

### Double-refund protection with result replay

- Added local tool-gate idempotency result replay for side-effectful actions.
- Added stable request digest validation so a used idempotency key cannot replay
  changed refund arguments.
- Added provider execution receipts for first execution and replayed results.
- Added hosted idempotency result records, `POST /execution-results`, replay
  responses from `/authorize`, and provider execution/replay audit events.
- Updated the approval console to record a provider result after execution and
  replay it on identical retry.
- Updated refund tests and demo to prove an identical retry returns the original
  result without running the provider mutation again.

### Hosted approval to single-use execution

- Added a durable approval queue endpoint with status filtering and expiration.
- Added the versioned `agentpass.approval-evidence.v1` contract across the
  local TypeScript guard, hosted gateway, JIT grants, TypeScript client, audit
  events, and approval console.
- Bound approval and JIT issuance to a canonical SHA-256 request digest covering
  the exact action scope and custom context.
- Required approver identity and a decision reason for hosted approval actions.
- Added approval-console controls for queue review, approval or denial, JIT
  issuance, one-time authorization, replay testing, and audit timelines.
- Added hosted lifecycle tests for queue listing, scope mismatch, expiration,
  single-use consumption, replay denial, and audit correlation.

## 0.2.0 - 2026-06-05

### Provider MCP authorization and receipts

- Added provider-side MCP authorization contracts for provider-published tool
  metadata, resource mappings, required context, receipt requirements, and
  provider constraints.
- Added provider MCP contract JSON Schema support, schema emission, validation,
  diffing, OpenAPI import, and enterprise manifest starter generation.
- Added provider MCP contract CI guidance and a copyable GitHub Actions
  workflow for provider contract validation and drift checks.
- Added provider authorization receipt verification for raw fixtures,
  HMAC-signed demo receipts, JWS/JWKS receipts, issuer and audience checks,
  remote JWKS fetching, JWKS cache TTLs, stale-on-error behavior, and key
  rotation refresh on unknown `kid`.
- Added provider receipt profile metadata with canonicalization, default binding,
  outcome, and privacy-preserving basis handling.
- Added provider contract validation for receipt profile defaults on high-risk
  tools.
- Added Express-compatible and FastAPI-compatible provider receipt verification
  middleware/helpers.
- Added a provider MCP authorization demo with local receipt verification,
  provider denial cases, replay handling, and provider execution receipts.

### MCP gateway and analyzer

- Added a TypeScript gateway client helper.
- Added the reference MCP gateway adapter for `tools/list` and `tools/call`
  authorization, argument mapping, denial responses, and structured decision
  logs.
- Added the MCP gateway adapter demo with a mock provider server.
- Added `agentaction mcp fetch` for fetching `tools/list` from HTTP MCP servers.
- Added `agentaction mcp analyze` for scoring saved MCP `tools/list` output.
- Added `agentaction mcp check` for CI-friendly MCP risk gates.
- Added `agentaction mcp diff` for detecting newly exposed tools and tool schema drift.
- Added `agentaction mcp ui` for writing a self-contained browser MCP analyzer.
- Added `agentaction mcp serve-ui` for localhost MCP analysis with local remote-fetch support.
- Added MCP analyzer UI compare mode and Markdown report export.
- Added MCP analyzer manifest snippet generation and JSON export support.
- Added a sample MCP `tools/list` response for analyzer testing.

### Authority model, skills, and policy

- Added job-boundary enforcement for binding tool calls to allowed jobs and
  out-of-scope checks.
- Added scoped agent-to-agent delegation checks for allowed agents, delegated
  tools, depth, and approvals.
- Added skill capability guardrails for skill-carried AgentPass contracts and
  allowed downstream tool invocation.
- Clarified AgentPass core concepts around skills, tools, flows, runtime
  authorization, and provider business authorization.

### Docs, standards, and positioning

- Added the getting-started guide, SaaS integration patterns guide, MCP gateway
  integration guide, provider MCP authorization guide, provider MCP positioning
  guide, and provider MCP demo guide.
- Added the "Turn Your API Into MCP, Safely" article and API-to-MCP adoption
  flow.
- Added ecosystem positioning material, visual assets, API monetization
  positioning, and MCP stable capability layer article.
- Added standards-alignment and outreach drafts for A2A, MCP, AGNTCY/OASF, and
  scoped authorization receipt feedback.
- Switched the project license to Apache 2.0.

## 0.1.2

- Added first-class just-in-time authorization support.
- Added `jit_authorization` section to the manifest.
- Added `auth_mode` support for tools: `delegated`, `service`, and `just_in_time`.
- Updated validation to require JIT configuration when tools use `auth_mode: just_in_time`.
- Updated risk scoring to reward short-lived JIT grants and penalize standing write/admin access.
- Updated audit checks for missing or invalid JIT grants.
- Updated OPA policy generation with starter JIT grant checks.

## 0.1.1

- Reframed AgentPass as an agent authority contract, not just an identity manifest.
- Added support for `intent`, `data_flows`, `delegation_chain`, `risk_tiers`, and `runtime`.
- Added validation warnings for missing runtime, intent, delegation-chain, and data-flow controls.
- Updated risk scoring to account for data-flow and agent-to-agent delegation risk.
- Updated audit checks for data-flow violations and agent-to-agent calls.
- Updated OPA policy generation with basic data-flow enforcement.
