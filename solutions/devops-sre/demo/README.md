# AgentID DevOps Control Demo

This Cloudflare Worker hosts a hypothetical DevOps/SRE control demo for
AgentID. It shows a release agent reading production context, being denied when
it tries to deploy without approval/JIT, receiving approval, getting a scoped
JIT grant, and then dispatching a dry-run production deployment.

Live demo target:

```text
https://agentid-devops-demo.drisw.workers.dev
```

The demo calls the deployed AgentID gateway through a Cloudflare Service Binding
when available. The browser never sees gateway credentials. For the
self-contained demo, the Worker mints a short-lived HS256-signed OIDC-style JWT
and the gateway validates it against the DevOps/SRE tenant manifest.

The UI includes guard-agent settings plus emulated external outcomes for
preflight checks and post-dispatch canary monitoring. Users can change CI
status, freeze-window state, service health, cloud status, and canary metrics to
see how different outcomes affect approval, JIT issuance, deploy forwarding,
and rollback-JIT handling.

The `Auto approve` toggle lets the same UI run either as a single-pass demo or
pause at a pending approval request. In manual mode, the Approval Review panel
shows the gateway approval payload and lets the user approve or deny before JIT
issuance.

## Local Development

```bash
cd solutions/devops-sre/demo
npm install
npm run dev
```

## Deploy

```bash
cd solutions/devops-sre/demo
npm run deploy
```

Required secret:

```bash
npx wrangler secret put AGENTID_DEMO_OIDC_SECRET
```

The gateway must have a tenant manifest stored in `AGENTID_MANIFESTS` under
`devops-sre-demo-agent`. For local smoke tests, the UI can run without real
GitHub credentials because the provider result is a dry-run dispatch receipt.
