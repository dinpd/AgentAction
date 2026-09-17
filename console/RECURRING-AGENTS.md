# Recurring agents and workspace notifications

Use **Run → My agents** to see recurring and supervised agents together, including
last results and upcoming schedules. **Run → Runs & approvals** and
**Monitor → Activity → Agent runs** show recent checks alongside supervised runs.
Refresh reads saved history without executing an agent. External event filters apply
only to the external activity section; checks are not signed Jobs or AI assessments.

Open **Recurring agents** (`/automations`) for configuration, scope, findings and
notifications. Website Health is the first handler on the shared recurring runtime.

## Operator workflow

1. A workspace owner configures email destinations in **Workspace notifications**.
   Settings apply to findings, recoveries, MCP approvals/execution failures and
   weekly recurring-agent summaries. Choose severity, immediate/digest routing,
   digest hour and optional quiet hours (UTC). Quiet hours also defer critical alerts.
2. Create a draft from a recipe. Website Health takes one page URL, optional
   expected content, and up to three explicitly approved redirect origins.
   Create additional instances for other pages/sites. No targets or recipients are
   embedded in source code or automatically installed in other workspaces.
3. Run a baseline and inspect scope, observations and findings. Creation does not
   fetch anything. Baselines are requested reads and may create findings/emails
   according to the saved workspace notification policy.
4. An owner reviews the baseline and authorizes automatic reads every 5/15/60/1440
   minutes. Operators can run a check, acknowledge findings and pause a schedule.
   Only owners change destinations, per-agent recipient subsets, or activate scope.
5. Inspect Findings and Recent runs. A successfully performed check that discovers
   an outage is a completed run with a finding. Failed/stale checks show unknown.
   Acknowledging a finding does not resolve it. A subsequent observation resolves
   it; recurrence opens a new episode. Pause stops future scheduled reads, not
   in-flight work or already-queued notification delivery.

## Reusable architecture

`RecurringWorkspace` is one SQLite-backed Durable Object per authenticated tenant.
`RecurringRuntime` owns schedules, run records, finding transitions and a durable
email outbox. `Handler` in `src/recurring-types.ts` owns input validation and the
bounded check, returning private persistent state, explicit present/absent/unknown
observations, completion status and a summary. A second inventory fixture handler
exercises the same engine in tests. Register reviewed handlers server-side; no
user-supplied executable code, prompts or tool output can register a handler.
Handler IDs and versions are pinned per instance. Changed versions require review.

A single persisted workspace record commits observations and outbox events together.
Next schedule slots are advanced before reads; duplicate alarms cannot replay a slot.
Missed slots produce one current check, not an unbounded backlog. A watchdog alarm
is installed before network work. Restart recovery marks unfinished checks unknown,
retains baselines, and marks in-flight email delivery uncertain before retrying.
No model is required to keep checking or dispatch alerts.

Existing `AgentWorkspace` instances send privacy-safe approval/failure events to the
same notification service after operations and scheduled runs. They learn their
workspace from a trusted BFF header on the next mutation after upgrade. A failed
bridge publish is retried at the next agent operation/alarm; it does not fail an
otherwise completed agent action. Only the internal service binding exposes event
ingestion, never a public/browser `notify` endpoint. Other trusted runtimes can use
this event contract. This is not yet a generic external telemetry API.

## Website Health coverage

- Credential-free HTTPS GET of a configured page. Three redirects maximum, each
  constrained to approved exact origins, public DNS validation and Workers'
  `global_fetch_strictly_public` network boundary. No private bindings or arbitrary
  headers. URL credentials, queries, fragments, nonstandard ports and literal IPs
  are rejected. Requests use a 20-second fetch deadline and at most 512 KiB HTML.
- Two consecutive failed observations (HTTP error, timeout or absent expected
  content) confirm availability trouble. This is **one location**, not independent
  geographic confirmation. HTTP response/latency and check summaries are retained;
  no 30-day uptime SLA or regional availability guarantee is inferred.
- Daily title, description, canonical and robots/noindex checks use parsed HTML,
  including X-Robots-Tag. Current and previous complete SEO snapshots persist.
  Missing metadata, noindex and metadata changes produce separately keyed findings.
  A failed fetch never resolves an existing SEO finding. Optional expected content
  is matched in returned HTML, not a rendered browser DOM.
- No JS rendering, full-site crawl, robots.txt/sitemap audit, TLS expiry, Search
  Console, PageSpeed, ranking guarantee or automatic repair in this first slice.
  Those are additional handlers/connectors, not changes to the scheduler/outbox.

Each run records completion, summary, observation states and a SHA-256 result digest.
These are operational observations, not signed gateway Jobs or independently
verified search-index outcomes. Gateway Evals and immutable finalized Jobs retain
their existing meaning; this release does not silently insert recurring runs there.

## Email delivery and limits

The deployment adds `NOTIFICATION_EMAIL` (`send_email`) restricted to the configured
sender and `NOTIFICATION_FROM_EMAIL`. The sender domain must be onboarded to
Cloudflare Email Service. Production uses `alerts@agentaction.dev`; recipients are
private tenant settings. Development does not supply a live email binding.
The UI reports missing bindings and failed/unconfirmed delivery. Saving settings
is not proof that the provider accepted an email. Use **Send test email**, then
inspect history. Provider acceptance is not proof of inbox receipt.

A stable delivery ID is included in `X-AgentAction-Delivery-ID`. Retry semantics are
at-least-once; it is not an idempotency guarantee from the provider. Five attempts,
exponential backoff, a 25-second send deadline and 100 attempts/workspace/UTC day
bound delivery. Removed recipients and narrowed agent routing cancel matching
unsent work. Daily digests group up to twelve events per recipient/time slot.
Recoveries go only to still-authorized recipients of the original incident.
Weekly summaries include last-check times and unresolved finding counts.

Limits per workspace: eight agents, forty manual checks/tests per UTC day, two due
agents per alarm batch, five email attempts per alarm batch, eighty retained runs,
128 finding keys (resolved records pruned first), sixty pending deliveries, thirty
completed deliveries, five email recipients and one MB persisted state. Queue
saturation is surfaced as a dropped-notification count; it never silently implies
successful delivery. Settings and recipe checks remain available without a model.
An external uptime service is still needed to alert independently when this whole
Cloudflare deployment is unavailable; the UI can identify stale checks when opened.

## Validation

- `npm test` includes generic engine, website checks and tenant/API security tests.
- `npm run dry-run` and `npm run dry-run:demo` validate hosted bundles.
- `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs PLAYWRIGHT_CHANNEL=chrome node --experimental-strip-types tests/recurring-browser.mts`
  exercises actual runtime-backed draft/baseline/activation, findings, notification
  settings, workspace isolation, viewer access, error handling and mobile layout
  with fake public-web and email transports. It sends no external messages.
- `wrangler types worker-configuration.d.ts --include-runtime false` regenerates
  binding types. Additive migration: `recurring-workspace-v1`; no existing data is
  rewritten. Deploy via the normal main-branch console workflow.
