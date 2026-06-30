# AgentPass OpenClaw Solution Pack

This pack demonstrates the smallest real OpenClaw deployment shape:

```text
OpenClaw trusted tool policy
  -> AgentPass /authorize
  -> OpenClaw native approval or block decision
```

The reusable plugin lives in [`packages/openclaw`](../../packages/openclaw/).
This solution pack is the runnable reference configuration for trying that
plugin against the AgentPass gateway.

## Included Files

- `agentpass-openclaw-manifest.yaml` - AgentPass manifest for OpenClaw-style
  read, browser, file, shell, message, cron, and session-control tools.
- `openclaw-config.patch.json` - OpenClaw config patch that enables the
  `agentpass` plugin in remote gateway mode.
- `fixtures/allowed-read.json` - direct `/authorize` request that should allow.
- `fixtures/denied-write-no-jit.json` - direct `/authorize` request that should
  deny because write access requires approval and JIT.
- `smoke-test.sh` - local gateway smoke test for the two fixtures.
- `repo-maintenance-use-case.md` - concrete OpenClaw repo-maintenance workflow
  showing read allowed and write denied without JIT.
- `repo-maintenance-use-case.mjs` - integrated use-case test that maps
  OpenClaw-style events through the real adapter runtime.
- `pr-reviewer-use-case.md` - concrete PR reviewer workflow showing PR diff
  fetch allowed and PR review submission denied without JIT.
- `pr-reviewer-use-case.mjs` - integrated PR reviewer test using the same
  OpenClaw adapter runtime.
- `secrets-exfiltration-use-case.md` - concrete secret exfiltration workflow
  showing local secret context allowed for analysis but blocked from browser
  form submission.
- `secrets-exfiltration-use-case.mjs` - integrated secret exfiltration test
  using OpenClaw-style events and the same remote runtime.
- `mcp-drift-use-case.md` - concrete MCP drift workflow showing an approved
  read-only tool surface and a drifted high-risk surface.
- `mcp-drift-use-case.py` - deterministic MCP drift test using AgentPass
  `tools/list` analysis and diffing.

## What It Proves

## Use Cases At A Glance

| Use case | Current enforcement point | What is protected |
| --- | --- | --- |
| Repo maintenance | OpenClaw trusted tool policy | Reads stay fast; file writes require AgentPass approval/JIT. |
| PR reviewer | OpenClaw trusted tool policy | PR diff fetch is allowed; browser review submission requires approval/JIT. |
| Secrets exfiltration | OpenClaw trusted tool policy + AgentPass data-flow policy | Local secret context can be analyzed; secret movement to browser forms is blocked. |
| MCP drift | AgentPass MCP preflight/startup check | New or changed MCP tools are detected before the tool surface is trusted. |

The first three use cases are enforced by the current OpenClaw plugin because
they happen at tool-call time. MCP drift is included as a preflight gate today:
run it in CI, gateway startup, or OpenClaw startup before exposing MCP tools.
A future OpenClaw discovery hook could move this from preflight into the plugin
runtime itself.

Read-only tool calls stay fast:

- `read`
- `web_fetch`
- `web_search`

State-changing or high-risk calls require approval and JIT:

- `browser`
- `write`
- `edit`
- `apply_patch`
- `exec`
- `process`
- `cron`
- `sessions_spawn`

The manifest binds decisions to `job_id`, so approvals and JIT grants are scoped
to the current OpenClaw run or session instead of creating standing authority.
This remote-gateway pack intentionally focuses on the AgentPass manifest action
model currently supported by the Python gateway: `read`, `write`, `execute`, and
`admin`. OpenClaw message/send-style actions can still be handled by the local
TypeScript guard policy in `packages/openclaw`; adding first-class hosted
`send` support is a follow-on gateway contract change.

## Run Locally

Terminal 1: start the AgentPass authorization gateway.

```bash
agentpass gateway solutions/openclaw-agentpass/agentpass-openclaw-manifest.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

Terminal 2: validate the direct AgentPass allow/deny behavior.

```bash
solutions/openclaw-agentpass/smoke-test.sh
```

Expected output:

```text
AgentPass OpenClaw smoke passed: read allowed, write denied without JIT.
```

## Run The Repo Maintenance Use Case

This use case exercises the actual OpenClaw adapter mapper and remote runtime:

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentpass/repo-maintenance-use-case.mjs
```

See [`repo-maintenance-use-case.md`](repo-maintenance-use-case.md) for the
workflow and expected result.

## Run The PR Reviewer Use Case

This use case exercises the web fetch and browser-submit path:

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentpass/pr-reviewer-use-case.mjs
```

See [`pr-reviewer-use-case.md`](pr-reviewer-use-case.md) for the workflow and
expected result.

## Run The Secrets Exfiltration Use Case

This use case exercises data-flow enforcement for secret-like fields:

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentpass/secrets-exfiltration-use-case.mjs
```

See [`secrets-exfiltration-use-case.md`](secrets-exfiltration-use-case.md) for
the workflow and expected result.

## Run The MCP Drift Use Case

This use case exercises MCP `tools/list` drift detection:

```bash
solutions/openclaw-agentpass/mcp-drift-use-case.py
```

See [`mcp-drift-use-case.md`](mcp-drift-use-case.md) for the workflow and
expected result.

## Install The OpenClaw Plugin

From this repository:

```bash
cd packages/openclaw
npm install
npm run build
npm pack
openclaw plugins install ./agentpass-openclaw-0.1.0.tgz
```

Then enable remote AgentPass mode:

```bash
openclaw config patch --file solutions/openclaw-agentpass/openclaw-config.patch.json
openclaw plugins inspect agentpass --runtime --json
```

Restart the OpenClaw gateway after applying the config patch.

## VM Shape

If OpenClaw runs in a VM, prefer running the AgentPass gateway in the same VM
for the first smoke test:

```bash
cd /workspace/AgentPass
agentpass gateway solutions/openclaw-agentpass/agentpass-openclaw-manifest.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

The included config patch points OpenClaw at `http://127.0.0.1:8787/authorize`,
which works when both services run in the same environment. If the gateway runs
on the host and OpenClaw runs in Lima, change `authorizeUrl` to
`http://host.lima.internal:8787/authorize`.

## Approval Flow

The smoke fixture intentionally denies `write` without JIT. To authorize a
write, create and approve an AgentPass approval request, mint a JIT grant, and
include that `jit_grant_id` in the authorization event. OpenClaw's plugin then
uses the AgentPass decision to return either a native OpenClaw approval prompt
or a block result.

For full interactive validation, open the OpenClaw UI and trigger a tool call
after the gateway and plugin config are running.
