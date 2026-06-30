# Use Case: Protected Repo Maintenance

This use case models a common OpenClaw workflow:

1. Inspect repository documentation.
2. Propose a documentation change.
3. Require AgentPass approval and JIT before the write executes.

The goal is to keep low-risk repository reads fast while preventing an agent
from making persistent file changes without scoped approval.

## Policy Boundary

The AgentPass manifest allows OpenClaw to read local project files:

```text
read README.md -> allow
```

The same manifest requires approval and JIT for writes:

```text
write README.md -> deny without jit_grant_id
```

This is the first practical adoption path for AgentPass with OpenClaw because
it protects the workflow most developers will try immediately: letting an agent
inspect code and then modify project files.

## Test Surface

The test uses OpenClaw-style tool events, not hand-written AgentPass payloads:

- `fixtures/openclaw-read-readme-event.json`
- `fixtures/openclaw-write-readme-event.json`

`repo-maintenance-use-case.mjs` maps those events through the actual
`packages/openclaw` mapper and remote runtime, then calls AgentPass
`/authorize`.

## Run

Terminal 1: start AgentPass.

```bash
agentpass gateway solutions/openclaw-agentpass/agentpass-openclaw-manifest.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

Terminal 2: build the OpenClaw adapter and run the use case.

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentpass/repo-maintenance-use-case.mjs
```

Expected result:

```json
{
  "useCase": "repo-maintenance-doc-update",
  "outcome": "passed",
  "read": {
    "tool": "read",
    "action": "read",
    "resource": "README.md",
    "decision": "allow"
  },
  "write": {
    "tool": "write",
    "action": "write",
    "resource": "README.md",
    "decision": "deny"
  }
}
```

## What This Proves

- OpenClaw tool events map into AgentPass checks correctly.
- AgentPass allows read-only repo inspection.
- AgentPass blocks persistent repo writes until approval/JIT exists.
- The integration works through the remote AgentPass gateway path that a real
  OpenClaw deployment would use.
