# Use Case: Tool Loop And Context Budget Gate

This use case models two frequent runaway-cost patterns:

1. The agent repeats the same low-risk tool call until the run becomes noisy or
   expensive.
2. A large heartbeat/context payload enters a tool-call path and exceeds a hard
   token budget.

The policy goal is to challenge before loops become expensive and deny payloads
that exceed hard per-job budgets.

## Current Enforcement Status

This use case is enforced by the current OpenClaw plugin in **local AgentAction
mode**, because the TypeScript guard owns in-memory budget state. Tool-call
payload budgets are enforced today.

Heartbeat or prompt-context growth that happens before a tool call still needs
an OpenClaw pre-model or heartbeat contribution hook. Until that hook exists,
this use case covers tool-call loops and large tool-call payloads, not every
possible context growth path.

## Policy Boundary

The local policy allows the first two repeated reads:

```text
read README.md -> allow
read README.md -> allow
```

The third repeated read crosses the soft tool-call budget and requires
approval:

```text
read README.md -> challenge_required
```

A large heartbeat-like context payload crosses the hard token budget and is
denied:

```text
read heartbeat.txt with large content -> deny
```

## Test Surface

The test uses OpenClaw-style tool events:

- `fixtures/openclaw-loop-read-event.json`
- `fixtures/openclaw-large-heartbeat-event.json`

`tool-loop-budget-use-case.mjs` maps those events through the actual
`packages/openclaw` mapper and local runtime.

## Run

From the repository root:

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentaction/tool-loop-budget-use-case.mjs
```

Expected result:

```json
{
  "useCase": "tool-loop-budget-gate",
  "outcome": "passed",
  "repeatedReads": [
    { "decision": "allow" },
    { "decision": "allow" },
    { "decision": "challenge_required" }
  ],
  "oversizedContext": {
    "decision": "deny"
  }
}
```

## What This Proves

- AgentAction can keep per-job budget state for OpenClaw tool calls.
- Soft limits can route through OpenClaw approval.
- Hard token limits can stop oversized payloads.
- A full heartbeat solution should reuse this policy shape behind an OpenClaw
  pre-model or heartbeat hook.
