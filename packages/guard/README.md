# @agentpass/guard

Dependency-free runtime guard for AI agent tool calls.

Use this package before an agent executes a tool, API call, browser action,
message send, payment, refund, export, or production change.

This package is a repo-local prototype today. It is not published to npm yet.
Use the examples to test the API shape and policy model.

The guard returns one of three decisions:

- `allow`: execute the tool call.
- `challenge_required`: pause and ask for approval.
- `deny`: block execution.

## Example

```ts
import { createGuard } from "@agentpass/guard";

const guard = createGuard({
  policy: {
    tools: {
      "stripe.refund": {
        action: "pay",
        requiresApproval: true,
        maxAmountUsd: 100,
        requireIdempotencyKey: true,
        singleUse: true
      }
    },
    budgets: {
      challengeAfterEstimatedCostUsdPerJob: 0.75,
      maxToolCallsPerJob: 20,
      maxSameToolCallsPerJob: 10,
      maxIdenticalToolCallsPerJob: 2,
      maxRetriesPerTool: 2,
      maxEstimatedCostUsdPerJob: 1,
      maxRuntimeMsPerJob: 300000
    }
  }
});

const decision = guard.check({
  agentId: "support-agent",
  jobId: "case-1042",
  tool: "stripe.refund",
  action: "pay",
  resource: "payment/pi_123",
  amountUsd: 49,
  idempotencyKey: "refund-case-1042-pi_123"
});

if (decision.type === "challenge_required") {
  // Ask a human or approval workflow before executing.
}

if (decision.type === "deny") {
  throw new Error(decision.reasons.join("; "));
}
```

## Tool Gate

Use `createToolGate` when you want AgentPass to sit directly in front of tool
execution:

```ts
import { createToolGate } from "@agentpass/guard";

const gate = createToolGate({ policy });

const execution = await gate.run(
  {
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 49,
    idempotencyKey: "refund-case-1042-pi_123"
  },
  () => stripe.refunds.create({ payment_intent: "pi_123", amount: 4900 })
);

if (!execution.executed) {
  return execution.decision;
}

return execution.result;
```

## What It Checks

- Closed-world tool declarations
- Tool/action mismatches
- Approval requirements
- Amount caps
- Idempotency keys and single-use actions
- PII/sensitive-data movement to unsafe destinations
- Field allowlists and blocked fields
- Destination domain allowlists
- Per-job tool-call, same-tool, identical-call, retry, token, cost, and runtime budgets
- Soft budget thresholds that return `challenge_required` before hard denial
- Optional `callFingerprint` values for detecting repeated tool calls without
  storing full tool parameters

This package is intentionally local and in-memory for the initial package.
Persistent approvals, policy distribution, shared counters, and audit export
belong in the runtime service layer.

## Local Demo

```bash
npm install
npm test
npm run demo
npm run demo:circuit
npm run demo:gate
npm run demo:pii
```

The refund demo shows the initial runtime-guard story:

1. A support agent proposes a refund.
2. The guard returns `challenge_required`.
3. The approved refund succeeds once.
4. A retry with the same idempotency key is denied.
5. A PII email to an unapproved destination is denied.

The circuit-breaker demo shows tool-thrashing and spend controls:

1. Repeated identical tool calls are denied.
2. Soft token/cost thresholds pause for approval.
3. Hard token/cost caps deny execution even after approval.

The PII demo shows destination-specific data movement rules:

1. CRM PII read into agent context is allowed.
2. Customer email requires approval.
3. Unknown webhook destinations are denied.
4. Raw PII prompts to model providers are denied.
5. Bulk file exports are capped by record count.
6. High-risk fields are blocked for browser automation.
