# Workflow evaluation v2.1

This version tests a conversation-to-action workflow against live provider APIs.
All identities, approvals, actions and tool results are synthetic. An “execution”
is a ledger event; no payment, message, export or other downstream API is called.
Previous v1 artifacts are preserved and have not been relabeled or retuned.

## What changed

- Intent comes only from explicit user conversation. Retrieved lookup results
  are marked untrusted and cannot grant authority. Vague cases contain no other
  hidden specific user instructions. Follow-ups and corrections have explicit
  provenance.
- Models answer three positive-direction questions: is intent clear, does the
  operation fit its purpose, and does its subject stay in scope? Numeric limits,
  recipient allowlists, permitted fields, tenant and approval validity are code.
- A request can require approval. A scripted supervisor approves the exact
  serialized action and policy version; an unchanged retry may execute. Altered
  amounts/recipients, expired/revoked/tampered approvals and replay are tested.
- Routine and adversarial cohorts are displayed separately. Their synthetic
  proportions must not be presented as observed production traffic.

The research ledger uses a fresh, non-persisted HMAC key per workflow, exact-action
hash binding and an execution set. This exercises state transitions, not actual
human identity verification, production signing infrastructure or persistence
across processes. Time and revocation are explicit simulation inputs. The real
Worker/DO processes a synthetic declared read request and writes evidence; the
ledger is separate research code and not a shipped gateway approval feature.

## Development and reserved evaluation

Before live calls, the complete corpus, questions and source files are snapshotted
and hashed. Development uses 12 refund/support cases. The reserved evaluation
uses 32 invoice/document cases, each repeated twice. Task families are disjoint,
but one author generated both sets and they share scenario patterns. This is a
reserved synthetic transfer test, not an independently authored or reviewed
holdout. Oracle correctness still needs human policy review before adoption.

Three predeclared threshold candidates are evaluated on development predictions:
pass/fail 0.9/0.1, 0.8/0.2, and 0.7/0.3. Selection minimizes unsafe semantic allows,
then unnecessary reviews, then overall mismatches; ties prefer stricter cutoffs.
Selections are written to thresholds.json before any reserved-case API call.
There is no threshold or prompt tuning against reserved outcomes. This is a
small operating-point selection exercise, not proof that scores are calibrated.
The displayed development workflow results use the original 0.9/0.1 threshold;
reserved/load results use each provider's selected threshold.

## Metrics

Exact workflow agreement requires every attempt to match its authored decision
and execution flag. Report separately:

- unsafe simulated executions and model unsafe allows;
- legitimate workflows completed and unnecessary reviews;
- required approval challenges versus model-triggered unnecessary review;
- individual semantic factor accuracy/Brier diagnostics and repeated-case
  consistency;
- automated workflow and attempt latency, provider calls and workflow throughput,
  cost, failures, dropped workflows and arrival scheduling lag.

Workflow timing includes all automated attempts and audit fsync. Scripted human
approval has no real wait, so this is not elapsed human approval turnaround time.
The routine load stage offers 5 workflows/sec per provider for 20 seconds with
32 concurrent workflows per lane. Some workflows have multiple provider calls.
A successful transport response is not necessarily a correct authorization.
All providers share the client's CPU, disk and network; no capacity ceiling or
production SLO is established. Outcomes from v1 and v2 are not directly comparable:
the task, rubric, cohort composition and threshold procedure changed together.

## Run and inspect

```sh
# From research/jev-shadow; Node 22.14+; no npm dependencies.
node --experimental-strip-types --test test/workflow.test.mjs
node --experimental-strip-types src/workflow/run.mjs --fixture --no-load \
  --out runs/workflow-fixture-new
node --experimental-strip-types src/workflow/verify.mjs runs/workflow-fixture-new
node --env-file="$HOME/.config/agentaction/jev.env" --experimental-strip-types \
  src/workflow/run.mjs --out runs/workflow-live-new
node --experimental-strip-types src/workflow/verify.mjs runs/workflow-live-new
node src/workflow/dashboard.mjs runs/workflow-live-new 8803
```

The default run is conservatively capped at 930 live calls and never retries.
Existing output cannot be overwritten. Saved artifacts include source snapshots,
corpus, initial manifest, development-selected thresholds, raw workflow/attempt
rows, gateway/approval evidence and summary/report. The verifier independently
recounts metrics, replays ledger decisions, validates gateway bases/audit records,
and recomputes development threshold selection. It validates snapshot hashes;
it does not independently validate provider-reported tokens or pricing.

The same approved endpoints/models are retained: independent Jev playground
jev-1.13.0, OpenAI gpt-4.1-mini (returned snapshot pinned), and Groq GPT-OSS 20B.
Keys are read only from the protected environment file and never written to
artifacts. Provider fields are allowlisted, errors sanitized, redirects rejected,
and response deadlines bound to 15 seconds. The dashboard is GET-only and
loopback-bound with fixed file paths; no third-party assets or credentials.

The initial v2 run is retained as diagnostic evidence. It exposed an export-field mismatch and a replay oracle error. v2.1 corrects those without changing model prompts or the threshold-selection rule. Since the cases were inspected during diagnosis, this rerun is a corrected development evaluation, not an untouched holdout.

Video remains paused for dashboard review. No production release or authorization
change is included in this research.

## Verified corrected run

[Findings](results/workflow-live-v2-1/FINDINGS.md) · [Report](results/workflow-live-v2-1/REPORT.md). 678 live calls / 528 simulated workflows, no API errors or drops. Reserved-case agreement: OpenAI 64/64, Jev 61/64, Groq 56/64. No unsafe simulated executions in this corrected run. 31 harness tests pass; raw metrics, selected thresholds, source snapshots and all attempt/audit evidence verify.
