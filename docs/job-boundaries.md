# Job Boundaries

Agent identity and tool permission are necessary, but they do not fully answer
whether an action belongs to the current task.

A job boundary defines the task the agent is allowed to perform right now. It
helps prevent scope drift, where a tool call is individually allowed but no
longer belongs to the user's requested job.

## Manifest Shape

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

`allowed_jobs` lists the jobs this agent may perform. `out_of_scope` gives
reviewers a clear list of nearby jobs the agent must not perform. The
`bind_authorization_to` fields must be present on runtime authorization
requests, so approvals and JIT grants can be tied to a concrete job and case.

## Runtime Check

Before a tool call, the app includes the job context:

```json
{
  "agent_id": "customer-support-refund-agent",
  "job_id": "refund_triage",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "tool": "stripe.create_refund",
  "action": "write",
  "resource": "refund/case-1042/1-month",
  "approved": true,
  "jit_grant_id": "grant-123"
}
```

The gateway denies the call when:

- `job_id` is required but missing.
- `job_id` is not in `allowed_jobs`.
- `job_id` is listed in `out_of_scope`.
- A field in `bind_authorization_to` is missing.
- A JIT grant was issued for one job, case, or customer but used for another.

## Refund Example

For the refund demo, a one-month refund can be inside `refund_triage`, while a
plan change, account deletion, or collections action is outside the job even if
the agent has access to some related customer records.

This gives the gateway a better question than "can this agent call Stripe?":

> Can this refund agent call Stripe for this refund job, this customer, this
> case, this approval, and this single-use grant?

## Relationship to Delegation

Job boundaries are especially important for agent-to-agent hand-offs. The
source agent should validate the proposed hand-off before calling the target
agent, and the request should include the same `job_id`, `case_id`, and
`customer_id` that bind the original workflow.

See [`agent-to-agent-delegation.md`](agent-to-agent-delegation.md) for the
delegation model.
