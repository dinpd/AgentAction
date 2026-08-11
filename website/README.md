# AgentAction website

The public technical website for AgentAction, the project brand succeeding
AgentPass. The site explains the action-authorization boundary, trust model,
current implementation evidence, roadmap, and open-source participation paths.

Existing package names, schemas, CLI commands, and repository links continue to
use AgentPass-compatible identifiers during the migration.

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
