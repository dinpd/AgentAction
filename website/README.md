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

## MCP checker

The primary navigation and homepage developer section link to
[the public MCP checker](https://mcpcheck.agentaction.dev). It runs on its existing
Worker with a custom domain; there is no duplicate website page or embedded frame.
Recipes remain available from the homepage section and footer.
