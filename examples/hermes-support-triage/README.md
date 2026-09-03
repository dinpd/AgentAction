# Hermes support-triage observability demo

This example replaces toy arithmetic with a synthetic refund-triage workflow.
Hermes reads a bounded policy and case, recommends a decision, cites the
applicable rules, and remains read-only. No real customer data or external
support, payment, or communication system is used.

The three cases demonstrate different policy and evaluation outcomes:

| Case | Expected recommendation | AgentAction result |
| --- | --- | --- |
| `eligible.yaml` | `ELIGIBLE` under `REFUND-01`, `REFUND-02`, and `REFUND-05` | Completed and qualified when all declared criteria are met |
| `ineligible.yaml` | `INELIGIBLE` under `REFUND-03` and `REFUND-05` | Completed and qualified because a correct ineligible determination is a successful evaluation |
| `manual-review.yaml` | `MANUAL_REVIEW` under `REFUND-04` and `REFUND-05` | Safe escalation is correct, while the deliberately requested definitive goal remains partial and not qualified; the read-only constraint still passes |

All six criterion reports are explicitly **Self-attested by agent**. Their
passing aggregate means the agent says it met the bounded rubric; it is not an
independent verification of the policy decision or case facts.

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

## Run the ineligible case

```bash
hermes chat --provider openai-codex --model gpt-5.6-luna --cli \
  --query-file prompts/ineligible.md
```

After the response returns, enter `/quit` to finalize the session.

Expected answer content:

- `Decision: INELIGIBLE`
- policy rules `REFUND-03` and `REFUND-05`
- the final-sale condition identified as disqualifying
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
- all six bounded criterion claims pass because safe escalation is the correct
  rubric behavior, even though the deliberately definitive Job goal is partial

## Verify AgentAction

In the workspace's **Activity** view, verify that the run includes:

- `agentaction_declare_intent`
- read-only `read_file` activity
- `agentaction_report_outcome`
- bound model and Job lifecycle events

In **Jobs**, verify that both finalized records use
`agentaction_declared_intent.v1` and are labeled **Self-attested by agent · not
trusted user intent**. The eligible case should be qualified; the
ineligible case should also be qualified because the decision is correct. The
manual-review case should show safe escalation while remaining unqualified for
its deliberately definitive goal, with constraint state `pass`. Its criterion
aggregate can still pass because the ambiguity-escalation criterion was met.
Every result must display **Self-attested by agent** and must not describe these
claims as independently verified.

The plugin never exports the raw prompt, file contents, tool arguments, tool
results, or final response. The console receives only bounded declared-intent
context and privacy-safe lifecycle metadata.
