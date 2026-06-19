# Authorization in Practice

AgentPass complements RBAC. RBAC answers whether an identity may use a tool.
AgentPass evaluates a specific proposed action using its arguments, job context,
approval state, and prior execution state.

The agent proposes an action. A trusted app runtime or gateway constructs the
authorization request from verified system data. AgentPass returns an allow,
deny, or approval challenge with findings that the agent can use to choose its
next action.

## Ecommerce Refund

This example uses the local TypeScript guard and its support-refund policy. The
policy caps refunds at $100, requires approval and an idempotency key, and makes
each successful refund single-use.

### Bad: No Guardrail

**Customer:** "Refund me $1,200 for the service outage."

**Agent:** Issues the refund using its Stripe access.

**Response:** "Your $1,200 refund is processing."

### OK: RBAC

**Customer:** "Refund me $1,200 for the service outage."

**Agent:** Attempts the refund.

**RBAC:** "Denied. This support role cannot issue refunds."

**Response:** "Sorry, I'm unable to provide a refund."

### Good: AgentPass

**Customer:** "Refund me $1,200 for the service outage."

**Agent -> AgentPass:** Authorize `stripe.refund` for payment `pi_123`, amount
`$1,200`, job `case-1042`, and idempotency key `refund-1042-pi_123`.

**AgentPass:** "Denied: amount exceeds the $100 maximum."

**Agent:** Proposes a $100 refund with an idempotency key scoped to the revised
action.

**AgentPass:** "Approval required." After the runtime supplies an approval ID:
"Allowed once."

**Response:** "I can't refund $1,200, but your approved $100 refund is
processing."

**Evidence:** The guard emits a decision event containing the decision ID,
amount, resource, approval context, idempotency key, and reasons. The integrating
application must persist these events if it needs a durable audit record.

Implementation references:

- [`support-refund-policy.json`](../packages/guard/examples/support-refund-policy.json)
- [`support-refund-demo.ts`](../packages/guard/examples/support-refund-demo.ts)
- [`guard.test.ts`](../packages/guard/tests/guard.test.ts)

## Production Rollback

This example uses the DevOps/SRE solution pack. Read-only diagnostics do not
require approval. A production rollback requires human confirmation and a
single-use JIT grant that expires after 180 seconds.

### Bad: Shared Production Access

**On-call SRE:** "Checkout errors spiked. Roll back production."

**Agent:** Uses shared production credentials and rolls back the latest
deployment without binding the action to an incident or rollback plan.

**Response:** "Rollback started."

### OK: Read-only RBAC

**On-call SRE:** "Checkout errors spiked. Roll back production."

**Agent:** Investigates, then attempts the rollback.

**RBAC:** "Denied. This agent has read-only production access."

**Response:** "`dep-842` appears responsible, but a human must perform the
rollback."

### Good: AgentPass

**On-call SRE:** "Checkout errors spiked. Roll back production."

**Agent -> AgentPass:** Request logs and deployment status for `checkout-api`
in `production` under job `incident_diagnostics` and incident `INC-2048`.

**AgentPass:** "Allowed: read-only diagnostics."

**Agent:** Identifies deployment `dep-842`, references existing rollback plan
`RB-2048`, and proposes `devops.rollback.production` for that exact scope.

**AgentPass:** "Approval and JIT authorization required." After an approver
confirms the scoped request, AgentPass issues a single-use grant valid for 180
seconds and bound to the agent, user, tool, resource, job, service, environment,
incident, deployment, and rollback plan.

**Response:** "The approved rollback of `dep-842` is running for
`checkout-api`."

**Evidence:** The approval record identifies the approver and approved scope.
The JIT grant records its bindings and expiry. The gateway decision produces a
receipt, and the provider execution log links the action to that receipt's
decision ID. Reusing the grant or provider receipt is denied.

Implementation references:

- [`enterprise-agent-manifest.yaml`](../solutions/devops-sre/enterprise-agent-manifest.yaml)
- [`gateway-config.json`](../solutions/devops-sre/gateway-config.json)
- [`mock-provider.ts`](../solutions/devops-sre/mock-provider.ts)

## Trust Boundary

AgentPass does not infer these facts from the conversation. The trusted runtime
or gateway should derive identity, payment, deployment, incident, and approval
fields from authenticated systems. Model-supplied values should be treated as a
proposal until that boundary verifies and maps them into an authorization
request.
