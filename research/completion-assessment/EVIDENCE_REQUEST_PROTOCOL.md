# Bounded additional-evidence requests, version 1

Design fixed locally before the first request experiment, after review of the
existing service and prior literature. This is not external preregistration.
The experiment asks whether a completion assessor can recover useful decisions
by requesting evidence, without repairing or repeating task effects.

## Decision and request interface

Keep the S/F/U outcome. A separate optional request accompanies U and identifies
the original contract digest, task, resource, required evidence and reason codes.
It does not authorize another refund or change the goal. The trusted requester
owns a one-round budget of at most two provider GETs. A fresh challenge and final
revision read bind the response to the assessment point. Requests cannot supply
arbitrary URLs, routes, methods, policy changes or trusted keys.

Plan requests only from contract/evidence and the initial assessor result, never
from complete state, truth, scenario labels or collection-channel labels.
Snapshot/observation/checkpoint/revision faults request a fresh full snapshot
and head. History-closure faults request both histories and a fresh head while
retaining the authenticated observation. Head-only faults request a fresh head.
Missing or unrecognized diagnostic information falls back to full recollection.
No second round follows a failed request or a revision mismatch. Decisive labels
do not trigger the on-unknown policies, including mistaken decisive labels.

## Corpus and policies

Cross all 31 existing service families and five parameter variants with four
collection conditions: 620 cases. These are 124 scenario/condition strata,
not independent deployment samples. No family or trust-violation control is
dropped. Five policies receive matched initial evidence and separately recreated
identical service states (3,100 policy assessments):

1. Latest static: existing latest-observation assessor, no additional reads.
2. Gate static: existing closure/revision gate, no additional reads.
3. Latest refresh: unconditionally request a full snapshot and head once, then
   use latest-observation assessment. It has the same two-read maximum opportunity
   as the gate policies, but ignores closure and revision safeguards.
4. Gate full: on U, request a full snapshot and head once, then reassess.
5. Gate targeted: on U, request the diagnosed evidence scope once, then reassess.

All request policies use the same collector and channel condition. Same maximum
acquisition budget does not mean identical realized reads or trigger policy.
Gate full is the direct ablation for targeted selection; Latest refresh is the
acquisition-capable baseline. Initial evidence cost is common and excluded.

## Collection conditions and controls

- Recovered: the requested read succeeds and the transient evidence defect does
  not recur. Provider state is unchanged.
- Unavailable: stop the provider process before acquisition; the actual GET
  receives connection refusal. No automatic retry. The database remains intact.
- Persistent omission: successful snapshot reads reach the broker, but the
  broker-to-assessor response omits the final receipt while retaining its original
  authenticated closure commitment. Apply this to each acquisition that includes
  history. A head-only read does not replace otherwise usable history.
- Revision race: after the first requested read, the harness commits a state write
  before the final head read (or before returning a head-only read). The write
  preserves settled state and every effect/history row but increments revision.
  Thus truth stays fixed while the version changes. This controlled invalidation
  probes bounded collection, not sampled real-world race frequency.

Each method has a separate database. The auditor verifies matching starting
states, fixed truth, and unchanged effects/history. Only the declared writer
condition may increment revision, by exactly one for a requesting method.
The writer is harness code outside the read-only request executor.

The unmediated duplicate remains absent from the ledger and revision. For the
lying-collector family, every newly collected observation continues to lie about
settlement. These ten cases per condition are outside the trust assumptions.
On-unknown policies cannot detect a false S that never triggers acquisition.

## Cost, results, and reproducibility

Preserve initial/final six-cell matrices and all standard metrics, requests,
attempted/successful provider reads, provider-response JSON bytes, and additional
broker-to-assessor evidence JSON bytes. Also save request scopes, status, reasons,
initial/final evidence, read records, and before/after audit tables. JSON byte
counts exclude HTTP headers, JWS envelopes and transport overhead; they are not
wire-bandwidth or latency measurements. Normalize challenges to fixed-width
case-specific UUID-shaped values before measuring bytes and saving results.

The existing provider offers a combined snapshot endpoint: a history request
still reads its full response at the broker. Report provider and assessor bytes
separately; selective delivery does not imply selective provider reads. Head-only
requests avoid a snapshot GET. No claim of minimum-cost evidence selection.

Report each collection condition separately as well as pooled and trust-stratum
results. No operational prevalence is assigned to the equally weighted conditions.
Report error/cost sensitivity as a declared descriptive analysis, without tuning
weights to favor the new policy. Preserve failures even if targeted selection
underperforms full recollection. Run twice with fresh signing keys/challenges and
independently audit labels, pairing, costs, state preservation and source hashes.

The evidence-request interface is a research protocol, not an AgentAction public
API. AgentAction supplies one contract/evidence adapter; another implementation
can provide the same boundaries. This study tests requesting observations, not
LLM planning, active-learning optimality or autonomous effect repair.
