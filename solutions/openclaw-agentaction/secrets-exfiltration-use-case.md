# Use Case: Secrets Exfiltration Boundary

This use case models a frequent OpenClaw risk:

1. The agent reads local configuration while debugging.
2. A malicious instruction or accidental workflow asks it to paste an API key
   into an external browser form.
3. AgentAction blocks the data movement before the browser submission executes.

The policy goal is to preserve useful local analysis while preventing sensitive
data from crossing into external destinations.

## Policy Boundary

The AgentAction manifest allows local file context to move into agent context:

```text
read .env -> allow
```

The same manifest blocks secret-like fields from moving into browser forms:

```text
browser submit api_key -> deny because secrets_manager -> browser_form is blocked
```

## Test Surface

The test uses OpenClaw-style tool events:

- `fixtures/openclaw-read-env-event.json`
- `fixtures/openclaw-submit-secret-event.json`

`secrets-exfiltration-use-case.mjs` maps those events through the actual
`packages/openclaw` mapper and remote runtime, then calls AgentAction
`/authorize`.

## Run

Terminal 1: start AgentAction.

```bash
agentaction gateway solutions/openclaw-agentaction/agentaction-openclaw-manifest.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

Terminal 2: build the OpenClaw adapter and run the use case.

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentaction/secrets-exfiltration-use-case.mjs
```

Expected result:

```json
{
  "useCase": "secrets-exfiltration-boundary",
  "outcome": "passed",
  "readEnv": {
    "tool": "read",
    "action": "read",
    "resource": ".env",
    "decision": "allow"
  },
  "submitSecret": {
    "tool": "browser",
    "action": "write",
    "resource": "https://example.invalid/support",
    "dataFrom": "secrets_manager",
    "dataTo": "browser_form",
    "decision": "deny"
  }
}
```

## What This Proves

- OpenClaw can inspect local project context without blocking every read.
- Secret-like fields are classified by the adapter before authorization.
- AgentAction blocks secret movement to browser forms even if the browser tool is
  otherwise configured as an approval-gated write path.
- The remote gateway path can enforce data-flow policy, not just tool names.
