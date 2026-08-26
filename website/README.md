# AgentAction website

The public technical website for AgentAction. The site explains the trust lifecycle
from intent and decision
assurance through action authorization, execution evidence, and continuous
evaluation, together with the current implementation, roadmap, and open-source
participation paths.

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
