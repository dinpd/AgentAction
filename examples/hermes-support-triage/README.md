# Hermes support-triage observability demo

This example replaces toy arithmetic with a synthetic refund-triage workflow.
Hermes reads a bounded policy and case, recommends a decision, cites the
applicable rules, and remains read-only. No real customer data or external
support, payment, or communication system is used.

The two cases demonstrate different evaluation outcomes:

| Case | Expected recommendation | AgentAction result |
| --- | --- | --- |
| `eligible.yaml` | `ELIGIBLE` under `REFUND-01`, `REFUND-02`, and `REFUND-05` | Completed and qualified when all declared criteria are met |
| `manual-review.yaml` | `MANUAL_REVIEW` under `REFUND-04` and `REFUND-05` | Partial and not qualified because the requested definitive decision is unavailable; the read-only constraint still passes |

These evaluations are agent self-attestations. They are useful for observing
declared goals, honest uncertainty, and constraint discipline, but they are not
trusted user intent or an independent correctness judgment.

## Prerequisites

Install and configure the AgentAction Hermes plugin as described in the
[integration guide](../../integrations/hermes-agentaction/README.md). The
plugin settings must include:

```yaml
capture_declared_intent: true
```

Use a dedicated synthetic/demo Hermes profile and a source scoped to the
intended AgentAction workspace. Do not copy production customer records or
credentials into this directory.

## Run the eligible case

From this directory, start a normal Hermes session so the turn-finalization
hook emits the completed Job lifecycle:

```bash
hermes chat --provider openai-codex --model gpt-5.6-luna --cli \
  --query-file prompts/eligible.md
```

After the response returns, enter `/quit` to finalize the session.

Expected answer content:

- `Decision: ELIGIBLE`
- policy rules `REFUND-01`, `REFUND-02`, and `REFUND-05`
- no external or mutating tool use

## Run the manual-review case

```bash
hermes chat --provider openai-codex --model gpt-5.6-luna --cli \
  --query-file prompts/manual-review.md
```

After the response returns, enter `/quit` to finalize the session.

Expected answer content:

- `Decision: MANUAL_REVIEW`
- policy rules `REFUND-04` and `REFUND-05`
- missing defect evidence identified
- a partial or failed self-reported outcome because the requested definitive
  decision could not be made
- constraint compliance remains `pass`

## Verify AgentAction

In the workspace's **Activity** view, verify that the run includes:

- `agentaction_declare_intent`
- read-only `read_file` activity
- `agentaction_report_outcome`
- bound model and Job lifecycle events

In **Jobs**, verify that both finalized records use
`agentaction_declared_intent.v1` and are labeled **Self-attested by agent · not
trusted user intent**. The eligible case should be qualified; the
manual-review case should not be qualified while its constraint state remains
`pass`.

The plugin never exports the raw prompt, file contents, tool arguments, tool
results, or final response. The console receives only bounded declared-intent
context and privacy-safe lifecycle metadata.
