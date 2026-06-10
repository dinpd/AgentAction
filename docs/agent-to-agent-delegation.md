# Agent-to-Agent Delegation

AgentPass should allow agents to involve other agents, but it should not let an
agent mint broad privileges for another agent.

The model is scoped delegation:

- The source agent must be allowed to call the target agent.
- The target agent must be listed in `delegation_chain.allowed_agents`.
- The chain depth must stay within `delegation_chain.max_depth`.
- The delegated tools must stay within `delegation_chain.allowed_delegated_tools`.
- Approval can be required before delegation.
- If another agent approves the hand-off, the approval agent must be explicitly
  allowed and independent of the source and target agents.
- Delegated authority should expire quickly and be auditable.

## Refund Case

In a refund workflow, a support agent may need a specialist risk-review agent
to check billing history before a refund. The support agent should not delegate
Stripe refund authority. It should delegate only the narrow lookup authority
needed for the review.

Pair delegation with a job boundary so the hand-off is tied to the current
refund case:

```yaml
job_boundary:
  required: true
  allowed_jobs:
    - refund_triage
    - refund_status_lookup
  out_of_scope:
    - plan_change
    - account_deletion
    - collections_action
  require_job_id: true
  bind_authorization_to:
    - job_id
    - case_id
    - customer_id
```

```yaml
delegation_chain:
  may_call_agents: true
  allowed_agents:
    - refund-risk-review-agent
  max_depth: 1
  allowed_delegated_tools:
    - billing.lookup_refunds
    - zendesk.search_tickets
  requires_approval: true
  approval_sources:
    - human
    - agent
  approval_agents:
    - delegation-policy-agent
  delegation_ttl_seconds: 300
```

Before the hand-off, the source agent asks the gateway to validate the proposed
delegation:

```json
{
  "agent_id": "customer-support-refund-agent",
  "tool": "agent.call.refund-risk-review-agent",
  "action": "execute",
  "called_agent": "refund-risk-review-agent",
  "delegated_tool": "billing.lookup_refunds",
  "delegation_depth": 1,
  "job_id": "refund_triage",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "approved": true,
  "approval_source": "agent",
  "approval_agent": "delegation-policy-agent"
}
```

If the gateway denies this pre-handoff check, the source agent should not call
the target agent.

The gateway should deny attempts such as:

- Calling an undeclared target agent.
- Delegating a tool outside `allowed_delegated_tools`.
- Delegating beyond `max_depth`.
- Delegating outside the current `job_id`, `case_id`, or `customer_id`.
- Delegating without approval when `requires_approval` is true.
- Using an approval source outside `approval_sources`.
- Using an approval agent outside `approval_agents`.
- Letting the source or target agent approve its own delegation.
- Delegating payment, admin, or destructive authority unless explicitly scoped
  and approved.

See [`examples/customer-support-delegation-agent.yaml`](../examples/customer-support-delegation-agent.yaml)
for a concrete refund-case manifest.

## Implementation Status

Implemented today:

- Manifest schema fields for scoped agent delegation.
- Manifest validation for `max_depth`, `allowed_delegated_tools`, and
  `delegation_ttl_seconds`.
- Gateway and audit checks for `called_agent`, `delegated_tool`,
  `delegation_depth`, `approval_source`, `approval_agent`, and delegation
  approval.
- TypeScript request fields for delegation checks.

Still needed for a full transferable-privilege model:

- A dedicated `POST /delegation-grants` endpoint.
- Durable, single-use delegation grants similar to JIT grants.
- Binding grants to source agent, target agent, user, tenant, delegated tools,
  resource, approval, expiry, and chain depth.
- Intersecting the source agent's delegated authority with the target agent's
  own manifest before allowing downstream tool execution.
- Revocation and audit events for delegation issuance and consumption.

Until those pieces are implemented, AgentPass can enforce whether a proposed
agent-to-agent call is allowed, but it should not be treated as a complete
subdelegation grant system.
