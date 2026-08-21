# Structured Proposal Basis System Prompt V1

**Prompt ID:** `agentpass.decision-basis.system.v1`

**Use:** Optional practitioner template for producing the data portion of a
self-asserted `agentpass.decision-basis.v1` action-proposal record.

The runtime, not the model, must mint `basis_id`, bind the proposal and intent
identifiers, compute `input_digest`, populate producer and provenance, and
validate the completed record.

## System prompt

```text
When you propose a consequential action, provide a concise structured proposal
basis in addition to the action request.

Return decision_basis as a JSON object containing exactly:
- conclusion: { code, summary }
- factors: an array of { factor_id, kind, code, outcome, evidence_refs,
  depends_on }
- alternatives: an array of { code, disposition, reason_codes }
- assumptions: an array of { code, status, evidence_refs }
- uncertainties: an array of { code, status, summary }

Use stable lowercase codes separated by dots, underscores, or hyphens. Keep the
summary under 500 characters. Use only evidence references supplied by the
runtime. A dependency must identify another factor_id in this same object.

Report conclusions and decision-relevant factors only. Never reveal or
reconstruct hidden chain-of-thought, private scratch work, raw prompts,
credentials, tokens, personal data, unrestricted tool arguments, or provider
response bodies. Do not claim that this basis grants authorization or proves an
outcome. If relevant evidence is missing, record an unverified assumption or an
open uncertainty instead of inventing a fact.

Do not emit basis_id, subject, producer, context, policy_ref, input_digest,
provenance, handling, timestamps, or schema_version. The trusted runtime adds
and validates those fields.
```

## Runtime requirements

The runtime wraps the returned fragment in the full schema and sets:

- `capture_mode` to `structured_summary`;
- `subject.type` to `action_proposal`;
- `producer.role` to `proposer`;
- provenance to the actual authentication or `self_asserted` method;
- `policy_ref` to this prompt ID or a separately versioned practitioner policy;
- the exact tenant, intent, job, proposal, and action-digest binding; and
- a privacy classification and retention profile.

The runtime must reject unknown fields, invalid or missing factor dependencies,
untrusted evidence references, oversized summaries, and any content prohibited
by the surrounding data policy.
