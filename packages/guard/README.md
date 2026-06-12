# @agentpass/guard

Dependency-free runtime guard for AI agent tool calls.

Use this package before an agent executes a tool, API call, browser action,
message send, payment, refund, export, or production change.

This package is a repo-local prototype today. It is not published to npm yet.
Use the examples to test the API shape and policy model.

The first use case is simple: put a circuit breaker and approval gate in front
of your agent's tools so loops, spend spikes, duplicate side effects, and PII
egress are caught before execution.

The guard returns one of three decisions:

- `allow`: execute the tool call.
- `challenge_required`: pause and ask for approval.
- `deny`: block execution.

## Five-Minute Path

```bash
git clone https://github.com/dinpd/AgentPass.git
cd AgentPass/packages/guard
npm install
npm run demo:quickstart
npm run demo:mcp
```

The quickstart demo shows the intended first integration:

1. A normal tool call executes.
2. A repeated tool call is allowed once.
3. The third identical call is denied.
4. A PII email pauses for approval.

Copy one of the starter policies and tighten it for your agent:

- [`policies/tool-spend-cap.json`](policies/tool-spend-cap.json): cap tool calls,
  retries, tokens, runtime, and estimated cost per job.
- [`policies/pii-egress.json`](policies/pii-egress.json): restrict PII movement
  to approved destinations and block high-risk fields.
- [`policies/refund-payment.json`](policies/refund-payment.json): require
  approval, amount caps, idempotency keys, and single-use execution.
- [`policies/shell-browser-guard.json`](policies/shell-browser-guard.json):
  challenge shell/file/browser actions and block secrets in external flows.
- [`policies/mcp-tool-gateway.json`](policies/mcp-tool-gateway.json): start a
  provider-style MCP tool policy with reads, writes, credits, email, and PII
  flows.

## Copy-Paste Wrapper

```ts
import { createToolGate } from "@agentpass/guard";

const gate = createToolGate({
  policy: {
    tools: {
      "web.search": { action: "read" }
    },
    budgets: {
      maxIdenticalToolCallsPerJob: 2,
      maxEstimatedCostUsdPerJob: 1
    }
  }
});

async function runAgentTool(toolCall) {
  const execution = await gate.run(
    {
      agentId: "research-agent",
      jobId: toolCall.jobId,
      tool: toolCall.name,
      action: "read",
      resource: toolCall.query,
      callFingerprint: `${toolCall.name}:${toolCall.query}`,
      estimatedTokens: toolCall.estimatedTokens,
      estimatedCostUsd: toolCall.estimatedCostUsd
    },
    () => executeTool(toolCall)
  );

  if (!execution.executed) {
    return execution.decision;
  }

  return execution.result;
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

## MCP Tool-Call Gate

Use `createMcpToolGate` when you want to guard MCP `tools/call` requests before
forwarding them to a provider or internal MCP server:

```ts
import { createMcpToolGate } from "@agentpass/guard";

const gate = createMcpToolGate({
  policy,
  mappings: {
    "provider.billing.issue_credit": {
      resource: (args) => `provider/customer/${String(args.customerId)}`,
      amountUsd: (args) => Number(args.amountUsd),
      idempotencyKey: (args) => String(args.idempotencyKey)
    }
  }
});

const execution = await gate.run(
  {
    params: {
      name: "provider.billing.issue_credit",
      arguments: {
        customerId: "cus_123",
        amountUsd: 49,
        idempotencyKey: "credit-case-1042-cus_123"
      }
    }
  },
  {
    agentId: "support-agent",
    jobId: "case-1042",
    userId: "user-17"
  },
  ({ call }) => forwardMcpToolCall(call)
);

if (!execution.executed) {
  return execution.decision;
}
```

The MCP adapter is dependency-free. It accepts a plain MCP-style `{ params:
{ name, arguments } }` object, maps arguments into an AgentPass guard check, and
uses the same `allow` / `deny` / `challenge_required` result as the local tool
gate.

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
npm run demo:quickstart
npm run demo:mcp
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
