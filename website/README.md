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
