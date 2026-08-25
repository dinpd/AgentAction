# AgentAction synthetic runner

This Cloudflare Worker produces bounded, deterministic AgentAction intent runs for
the observability console. A UTC Cron Trigger invokes the Worker every 15
minutes. The Worker calls the real `agentid-gateway` through a service binding;
it does not call Stripe, Zendesk, or another external provider.

The runner registers two immutable versions of
`agentpass_synthetic_support_refund`, issues profile-bound intent contracts,
exercises authorization, approvals, JIT grants, execution receipts, preview
evaluation, and finalization, and cycles through controlled quality scenarios.
The profiles deliberately omit provider observations and trusted-observation
requirements. Production unsigned observation ingestion remains disabled.

Configuration:

- `SIMULATION_ENABLED`: kill switch; only the exact value `true` runs jobs.
- `SIMULATION_TENANT_ID`: dedicated tenant route, currently
  `refund-demo-agent`.
- `SIMULATION_CADENCE_MINUTES`: must match the Cron cadence.
- `SIMULATION_JOB_CAP`: hard cap of one or two jobs per scheduled run.
- `AGENTID_GATEWAY_TOKEN`: secret matching the gateway's
  `AGENTID_INTERNAL_SERVICE_TOKEN`.

`GET /health` is public and intentionally redacted. It reports configuration,
the latest schedule bucket, aggregate status, scenario names, and verdict
counts; it never returns credentials, intent IDs, job IDs, evidence, or gateway
response bodies.

Run the verification suite:

```sh
npm ci
npm test
npm run dry-run
```

For local scheduled-event testing, use Wrangler's scheduled route:

```sh
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"
```
