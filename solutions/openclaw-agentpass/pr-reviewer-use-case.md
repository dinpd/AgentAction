# Use Case: Gated PR Reviewer

This use case models an OpenClaw agent reviewing a pull request:

1. Fetch the PR diff.
2. Analyze the code and draft feedback.
3. Require AgentPass approval and JIT before submitting the review through the
   browser.

The policy goal is to let agents inspect public or internal pull request
context freely, while preventing them from publishing review comments, approvals,
or change requests without scoped human approval.

## Policy Boundary

The AgentPass manifest allows read-only PR inspection:

```text
web_fetch https://github.com/dinpd/AgentPass/pull/123.diff -> allow
```

The same manifest requires approval and JIT before OpenClaw can submit a review
through a browser form:

```text
browser submit https://github.com/dinpd/AgentPass/pull/123 -> deny without jit_grant_id
```

## Test Surface

The test uses OpenClaw-style tool events:

- `fixtures/openclaw-fetch-pr-diff-event.json`
- `fixtures/openclaw-submit-pr-review-event.json`

`pr-reviewer-use-case.mjs` maps those events through the actual
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
node solutions/openclaw-agentpass/pr-reviewer-use-case.mjs
```

Expected result:

```json
{
  "useCase": "pr-reviewer-gated-publication",
  "outcome": "passed",
  "fetchDiff": {
    "tool": "web_fetch",
    "action": "read",
    "resource": "https://github.com/dinpd/AgentPass/pull/123.diff",
    "decision": "allow"
  },
  "submitReview": {
    "tool": "browser",
    "action": "write",
    "resource": "https://github.com/dinpd/AgentPass/pull/123",
    "decision": "deny"
  }
}
```

## What This Proves

- OpenClaw can gather PR context without approval friction.
- Publishing a PR review is treated as a state-changing browser action.
- AgentPass blocks the publication step until approval/JIT exists.
- The same remote gateway path works for web and browser tools, not only local
  filesystem tools.
