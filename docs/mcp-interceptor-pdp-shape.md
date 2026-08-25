# MCP Interceptor / PDP Shape

This note maps AgentAction to the MCP standards vocabulary that came up in the
fine-grained auth, interceptor, gateway, security, and tool-annotation
discussions.

AgentAction should be framed as a call-time runtime gate, not as generic
client-side authorization preflight.

```text
MCP client -> gateway/interceptor -> AgentAction decision -> downstream tools/call
```

The gateway or interceptor owns the enforcement point. AgentAction can run in
process as a local guard or behind the gateway as a policy decision service.

## Where It Sits

In MCP terms, AgentAction belongs at the `tools/call` boundary:

- The client or agent proposes a tool call.
- The gateway/interceptor maps tool name, arguments, identity, job context, and
  data-flow context into an AgentAction check.
- AgentAction returns `allow`, `deny`, or `challenge_required`.
- The gateway forwards only allowed calls to the downstream MCP server.
- Denials are returned as MCP errors with structured findings.

This is compatible with PDP-style deployments:

```text
Policy Enforcement Point: MCP gateway, interceptor, app runtime, or provider
Policy Decision Point: AgentAction local guard or hosted /authorize service
Policy Information: identity, job state, tool args, approval state, data labels
Policy State: idempotency keys, job budgets, prior calls, approvals, audit log
```

## What It Adds Beyond Tool Scopes

Tool scopes and annotations are useful inputs. They can say that a tool is
read-only, destructive, privacy-sensitive, or requires step-up.

AgentAction decides whether this specific call should execute right now:

- Has this idempotency key already been consumed?
- Has this job called the same tool too many times?
- Is the agent moving PII to an unapproved destination?
- Was approval granted for this exact action, resource, amount, destination,
  and expiry?
- Should the gateway return a structured denial instead of forwarding?

The important state is job state, not transport session state. A transport
session can disappear, rotate, or fail to match the user's task. The gate needs
a stable job or workflow boundary supplied by the runtime.

## Local Or Hosted

The MCP gateway adapter supports two shapes:

- **Local guard:** policy and state live in the gateway process. This is useful
  for demos, tests, single-process runtimes, and embedded agent apps.
- **Hosted decision service:** the gateway calls AgentAction `/authorize`. This is
  the production shape when approvals, idempotency records, budgets, and audit
  need durable storage.

The local path is intentionally process-local. Production gateways should use
durable storage or a hosted decision service for state that must survive
restarts and scale across workers.

## Structured Denial Fit

AgentAction denials can map cleanly to MCP structured denial/remediation work:

```json
{
  "code": -32003,
  "message": "AgentAction denied MCP tool call",
  "data": {
    "findings": ["idempotencyKey was already used"],
    "event": {
      "decision": "deny",
      "tool": "provider.billing.issue_credit",
      "jobId": "support_case_resolution"
    }
  }
}
```

For step-up cases, `challenge_required` carries approval evidence that can be
shown to a human or exchanged for a short-lived grant. That evidence should be
bound to the exact tool, resource, payload, destination, job, and expiry.

## Two-Minute Demo

From the repo root:

```bash
cd mcp-gateway-adapter
npm install
npm run demo:local-guard
```

The demo runs the adapter in process and proves:

- `tools/list` filters unmapped tools.
- A safe read forwards to the downstream MCP server.
- An approved credit forwards once.
- A duplicate credit is denied before the provider sees it.
- A looping job is stopped by job state.
- PII egress is denied before forwarding.
