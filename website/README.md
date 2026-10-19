# AgentAction website

The public technical website for AgentAction. The site explains the trust lifecycle
from intent and decision
assurance through action authorization, execution evidence, and continuous
evaluation, together with the current implementation, roadmap, and open-source
participation paths.

The site links two observability surfaces with distinct trust boundaries:

- the [public console demo](https://agentaction-observability-demo.drisw.workers.dev/?window=7#overview), which contains only synthetic fixtures and requires no sign-in; and
- the [operator console](https://observability-console.agentaction.dev/?window=7#overview), which remains protected by Cloudflare Access for real tenant evidence.

The available intent and outcome console is described separately from roadmap
work for richer OpenTelemetry causal correlation.

Existing package names, schemas, CLI commands, and repository links continue to
retain legacy identifiers where compatibility requires them.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm run lint
node --test tests/rendered-html.test.mjs
npm audit --omit=dev
```

The production build targets a Cloudflare Worker through vinext. Hosting
metadata is stored in `.openai/hosting.json`; no credentials belong in the
repository.

## Project inquiry delivery

The homepage project form sends directly to `info@agentaction.dev` through the
Cloudflare Email Service REST API and does not store submissions. Configure the
Sites production runtime with `CLOUDFLARE_ACCOUNT_ID` and the secret
`CLOUDFLARE_EMAIL_API_TOKEN`; neither value is exposed to the browser. Email
Sending must be enabled for `agentaction.dev`, and the destination used by the
`info@agentaction.dev` Email Routing rule must be verified before delivery can
succeed.


## Agent recipes

`/recipes` is the job-oriented directory, with reviewed manifests in `../recipes/catalog.json`. Each detail page exposes instructions, required tools, boundaries, outcome fixtures, and portable downloads. `/recipes/publish` explains provider submissions. The initial entries have fixture evidence only; no live-performance badge is inferred from those checks.

Run `node --experimental-strip-types ../recipes/check.ts` and `node --experimental-strip-types --test ../recipes/registry.test.ts` alongside the site tests. Recipe changes trigger website and console CI. The console receives a non-secret catalog ID/version; it still requires normal authentication and explicit workspace setup.

## Completion-assessment research

The homepage Research update links to `/research/completion-assessment`, the
landing page for **Can We Trust 'Done'? Evaluating Agent Completion and Requests
for Additional Evidence** by Dan Itkis, MsETM (AgentAction.dev). It identifies the
September 25, 2026 manuscript as a preprint, explains the experiment boundaries,
and links directly to the pinned research artifact.

The first-party PDF at
`/research/completion-assessment/can-we-trust-done-2026-09-25.pdf` is an unchanged
copy of `research/completion-assessment/output/pdf/agent-task-completion-arxiv.pdf`
in the project repository. The rendered-route acceptance test verifies its SHA-256
alongside byline, preprint status, scope, navigation and discovery metadata.

The page includes the manuscript abstract and unchanged service-outcomes figure, with scope and alt text. Optional reader registration posts to `/api/research-download` and sends email to the existing private `info@agentaction.dev` inbox using the existing runtime-only email configuration. Email is required only for registration; name and organization are optional. It does not subscribe readers to a mailing list or store their details in browser storage. Direct PDF links work without registration or JavaScript, including when registration fails. Public review comments use a prefilled GitHub issue link.

The registration handler bounds streamed request bytes, checks origin, validates fields, rejects control characters and honeypot/timing failures, uses a fixed recipient and subject, times out provider requests, and returns no submitted personal data. The existing inbox is the data store; no new database is introduced. Honeypot/timing checks are bot friction, not a rate limit. Tests mock email delivery; they do not send live registration emails.

## MCP checker

The shared homepage, gateway, and landscape header separates Explore links from
visitor Tools: MCP Checker and Console. The shared Explore menu is Platform /
Landscape / Research / Blog / Start here, including on the paper page. Platform, Research
and Start here link to the corresponding homepage sections. Browse MCP servers
appears beneath Open My agents in section 4, Agent Creation & Evaluation. Landscape stays in Explore;
Start here is highlighted, and all shared headers retain GitHub. Both
groups remain visible at mobile widths.

The primary navigation and homepage developer section link to
[the public MCP checker](https://mcpcheck.agentaction.dev). It runs on its existing
Worker with a custom domain; there is no duplicate website page or embedded frame.
Recipes remain available from the homepage section and footer.

## Temporal authorization demo

The homepage hero contains a compact native interactive simulation replacing
the static assessment illustration. It starts while visible (except with reduced
motion), pauses offscreen and offers scenario, playback, step and reset controls.
`/demo` is its optional expanded presentation view. Five synthetic MCP servers illustrate per-tool access,
accumulated evidence, customer history, data minimization, evidence expiry,
confirmed outcomes and consumed actions. Play/pause, step, rewind, reset,
scenario selection and historical-call inspection use local state only.

All provider records and policies are simulated. No MCP connections, network
requests, model inference, real refunds or email delivery occur. Field
allowlists illustrate sanitization; they do not implement general prompt
injection detection. This demo does not change supported runtime enforcement.

`npm test` includes sequence and rendered-route acceptance. Browser acceptance:
`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/demo-browser.mjs`
against a local preview, with `DEMO_ORIGIN` overriding `http://localhost:3000`.

## Agentic IAM blog

Issue 02 covers October 7–17, 2026 inclusive and is published October 18 at
`/blog/agentic-iam-digest-2026-10-17`. Its seven primary sources cover Okta's
gateway, Workday's C1.ai acquisition agreement, CERT-In's advisory, Oracle's
rollout account and three authorization/approval research publications. It
separates vendor availability, planned capabilities, research status and
editorial outlook, and discloses the October 7 overlap with Issue 01.

The existing AI-generated illustration is reused with an explicit caption.
Post metadata carries issue number, coverage, publication date and homepage
copy. The blog index, homepage highlight and sitemap read that metadata; each
article selects its own slug so future issues cannot change archived metadata.

### New in AgentAction

The homepage pairs the digest with public feature news, side by side on desktop
and stacked below 900px. It pulls reviewed `### Website highlight` copy from
public GitHub release notes, published by the existing release CI. The delivery
prompt in `AGENTS.md` requires a plain-language headline and summary;
`scripts/check_release.py` checks format and length before release. Describe
what visitors can now do, retaining material preview and synthetic-data limits.
Technical Added bullets and raw Git subjects are never displayed.

`See what changed` opens `/whats-new`, an accessible public archive with the same
cached feed, newest first. It retains up to six feature versions, combining
candidate/stable releases of the same feature version. Both surfaces share one
cache; incomplete feeds and outages preserve recent reviewed entries. Release
note `updated_at` timestamps allow public-copy corrections without letting old
feed copy replace a newer reviewed fallback. Sitemap and canonical metadata
make the archive discoverable.

Phrase highlights around enduring capability and user benefit. For Workato,
lead with the integration and describe the synthetic refund recipe as supporting
evidence, not the product’s identity. Keep actual reference/preview scope
explicit. Five recent release-backed entries are bundled in
`app/public-news-fallback.json` and mirrored in the corresponding changelog and
GitHub notes; future release CI publishes reviewed copy automatically.

Only minor/major releases with Added content and a Website highlight qualify;
patches, drafts and legacy notes without public copy are skipped. Release
candidates are labeled. The highlight is a single `- Public headline: Public
summary` bullet (90/230 characters). The bundled history records its editorial
review timestamp separately from each source release's publication date.

Refresh is server-side on visits, cached for one hour per Worker instance, with
coalesced requests, a two-second timeout, a 256 KiB response limit and five-minute
failure backoff. Outages retain bundled or last-good content. No credentials,
CI write permissions, schedule or new deployments are needed for future
highlights. If patch releases push the feature out of the 30-release feed, the
fallback/last-good card remains.

`/blog` lists dated editorial issues. The first issue covers September 25–October
7, 2026 at `/blog/agentic-iam-digest-2026-10-07`, with primary-source links,
availability distinctions, preprint limitations, older context and an explicitly
editorial longer-term outlook. The homepage includes a compact digest subheader directly beneath navigation,
with the vector summary and article lead-in, and the shared header links to Blog. Add issue metadata to
`app/blog/posts.ts` so index and sitemap discovery stay aligned.

The original header illustration was generated with the built-in ImageGen tool
and compressed to `public/blog/agentic-iam-2026-10-07.jpg`. Prompt: abstract agent
nodes following fine branching paths through separate translucent authorization
gates, delegated identity and bounded access, midnight navy backdrop, electric
blue/cyan light and subtle amber evidence points; wide editorial composition,
no text, logos, robots, locks or shield clipart. The header is locally packaged;
no external image hotlink, reader tracking, form or subscription is added.

Rendered-route acceptance checks the digest, primary sources, dates, maturity
labels, illustration bytes, homepage lead-in, canonical/article metadata and
sitemap. `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node
tests/blog-browser.mjs` checks navigation and layout at desktop/mobile widths
against `BLOG_ORIGIN` (default `http://localhost:3000`).
