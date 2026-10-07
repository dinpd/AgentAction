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

`/blog` lists dated editorial issues. The first issue covers September 25–October
7, 2026 at `/blog/agentic-iam-digest-2026-10-07`, with primary-source links,
availability distinctions, preprint limitations, older context and an explicitly
editorial longer-term outlook. The homepage includes a short vector highlight
and lead-in, and the shared header links to Blog. Add issue metadata to
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
