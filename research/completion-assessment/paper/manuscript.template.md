# When Is an Agent Task Complete? A Fault-Injection Study of Evidence-Based Assessment

Dan Itkis

AgentAction.dev

Research draft - September 24, 2026

## Abstract

An authorized tool invocation, a successful transport response, and a completed task are different claims. Systems that assess agent work must additionally decide whether their evidence is authentic, sufficiently complete, and relevant to the state being assessed. We study these boundaries in AgentAction, an existing open-source implementation of intent contracts and deterministic outcome assessment. A reproducible offline artifact exercises the unmodified evaluator and observation verifier using three provider emulators, {{scenario_count}} scenario families, and {{case_count}} parameterized cases. Seven mechanism configurations produce {{assessment_count}} assessments. Within this deliberately fault-enriched corpus, verified ingestion with existential predicates reduces false success from {{tool_fs}}/{{negative_count}} for a transport-status baseline to {{ingress_fs}}/{{negative_count}}, at {{ingress_coverage}} decisive coverage. These rates describe the constructed corpus, not deployment reliability. Authentic but incomplete histories, observations preceding an unobserved state change, and a lying trusted issuer still produce false success. Universal predicates reject conflicting observations but also reject legitimate state evolution; a latest-observation adapter resolves that specific tradeoff without addressing the remaining information gaps. Matched cases with identical exposed evidence and opposite ground truth demonstrate why abstention is sometimes necessary. The contribution is a documented fault model, executable comparative artifact, and characterization of assessment limits rather than a new cryptographic primitive or a claim of universal completion verification.

## 1. Introduction

An agent may finish its conversation while its requested effect remains incomplete. A deployment tool can accept a release whose replicas never become healthy. A refund request can be accepted before settlement. An export can finish with fewer rows than required. Even when the desired state is present, a duplicate effect or an approval violation may invalidate the task. A completion decision therefore depends on more than whether the last tool call returned without an error.

Outcome evaluation itself is well established. For example, tau-bench evaluates interactions against final database state [@taubench]. Runtime systems also enforce constraints on proposed actions [@agentspec]. More recently, EvidenceNet has studied completion admission using current, source-bound observations in network operations [@evidencenet]. The remaining question addressed here is narrower: what happens when an implemented completion assessor receives incomplete histories, authenticated but temporally misleading observations, or evidence presented at the wrong trust boundary?

We investigate this question through a case study of AgentAction [@agentaction]. Its local evaluator checks a frozen intent contract against decisions, execution receipts, observations, and job metadata. A separate ingestion component authenticates observations and checks their lifetime and binding. This separation provides a useful experimental boundary: it permits us to isolate the value of verification while testing what verification cannot establish.

We contribute an executable fault-injection artifact with independent emulator-state ground truth; a comparison of seven transparent mechanism configurations; and a characterization of failure families involving provenance, completeness, temporal interpretation, and abstention. The study retains failures of the evaluated implementation. It neither estimates real-world incident frequency nor ranks agent models. The experimental unit is a domain-scenario stratum, with parameterized variants used to check consistency rather than to inflate statistical confidence.

The central finding is that increasing evidence integrity does not remove the need to specify what the evidence covers. A signature can authenticate a partial history. A recent observation can precede a state change. A universal predicate can confuse historical incompleteness with current failure. These are distinguishable assumptions that should appear in a completion contract and in its evaluation protocol.

## 2. Related Work

**Runtime enforcement.** AgentSpec specifies triggers, checks, and interventions for LLM-agent actions [@agentspec]. Our experiment studies the downstream assessment of an already executed or attempted task. It does not compare enforcement effectiveness with AgentSpec, and it introduces no new runtime policy language.

**Completion admission.** EvidenceNet is the closest prior work [@evidencenet]. It combines completion contracts, brokered observations, source binding, network epochs, deterministic conditions, and verifier assessment. Its evaluation distinguishes admission from external task truth and includes controlled evidence interventions. We therefore do not claim novelty for completion contracts, independent outcome checks, or content-only controls. Our case study examines a separate implementation across small refund, deployment, and export emulators, with explicit unknown outcomes, absent versus empty streams, and opposing effects of historical and current-state predicates. EvidenceNet's epoch mechanism also illustrates an assumption absent from our tested time-to-live policy.

**Execution provenance and composition.** Proof of Execution connects governed execution to verifiable contract, effect, history, and replay evidence, subject to explicit cryptographic and deployment assumptions [@poe]. CONTINUITY studies authenticated security context across component boundaries and evaluates a deterministic fault suite [@continuity]. Our provenance-misuse control examines one such boundary, but our task is assessment rather than effect authorization. Neither system is reimplemented in our experiment.

**Attestation and evaluation.** in-toto supplies a precedent for verifying provenance across a software supply chain [@intoto]. RATS distinguishes evidence, appraisal policy, and attestation results and discusses freshness mechanisms [@rats]. We apply an analogous distinction at the task-assessment level without claiming RATS conformance. Selective classification motivates reporting coverage together with error when a method can abstain [@selective]. We use descriptive finite-corpus metrics and do not inherit a learned classifier's statistical guarantees.

## 3. Problem and Trust Boundaries

### 3.1. Task truth and exposed evidence

Let C describe a task's required outcomes, hard constraints, and evidence requirements. Let W be the provider state and effect history after execution. An independent oracle defines Y(C,W), which is true only if the required state exists and the execution satisfies the hard constraints. The assessor does not see W directly. It sees an evidence view E, possibly incomplete or corrupted, and returns S (qualified success), F (observed failure), or U (indeterminate).

In our workflows, success requires the correct domain state, approval, and exactly one side effect. A replay returning an existing result produces no new side effect. The oracle reads complete emulator state and does not invoke the production predicate evaluator. A provider observation, by contrast, reports the latest state of a resource; it does not certify that every historical effect has been included.

The completion decision is distinct from task truth. An unsuccessful job can legitimately receive U when the available evidence cannot establish its outcome. A successful job can also receive U. Conversely, a positive decision supported by authenticated input may still be false if the authenticated input omits a relevant effect or no longer describes the current world.

### 3.2. Verification and interpretation

We distinguish four assumptions. First, the contract authority defines the intended task correctly. Second, an ingestion boundary establishes an observation's issuer, signature, lifetime, and task binding. Third, evidence producers report relevant state truthfully. Fourth, the evidence view covers the events and state changes needed by the contract. The experiment explicitly violates each relevant evidence assumption in a labeled scenario rather than treating them all as signature failures.

The production local evaluator consumes normalized records whose provenance has already been established. It checks the provenance metadata and canonical payload digest, but it does not independently verify a compact JWS or enforce the ingress freshness policy. Passing arbitrary caller-created provenance objects directly to it violates that interface assumption. We include this misuse as a diagnostic control and distinguish it from the verified-ingress configuration.

Decision and receipt streams are supplied by a trusted harness. Their transport authentication, complete mediation, and persistent storage are outside this experiment. Observation signatures use fresh RSA-2048 keys and the actual production RS256 verification path. The issuer's public key is returned by an in-process JWKS substitute; no external service is contacted. A designated trusted-signer-falsehood scenario deliberately violates producer truthfulness and is an out-of-trust-model control.

### 3.3. An observability limit

**Proposition.** Suppose two allowed worlds W+ and W- have opposite oracle labels but expose the same contract and evidence to a deterministic assessor. Any decisive label on that shared input is wrong for at least one world.

**Proof.** The assessor receives identical inputs and therefore emits the same label for both worlds. If that label is S, it is wrong for W-. If it is F, it is wrong for W+. U avoids a false decisive statement. The same argument prevents a randomized assessor from guaranteeing an error-free decisive answer in both worlds. This is an elementary indistinguishability observation, not a new general impossibility theorem.

Our missing-observation pairs instantiate the proposition. One world has settled or completed and one has not; both expose identical contracts, allow decisions, executed receipts, and no outcome observation. The cases show why replacing every unknown with either success or failure cannot solve the assessment problem.

## 4. Implementation Under Study

AgentAction issues per-job contracts from versioned profiles. The profile fixes required predicates, constraints, and trusted-observation requirements; typed variables bind job-specific resources and desired values. Contract digests accompany evidence. The evaluator independently reports outcome status, constraint compliance, qualified success, execution discipline, and an evidence-confidence field [@agentaction].

Our profiles select provider-state observations by predicate and compare their fields with the issued variables. Refund outcomes require the target payment, expected amount, and settled status. Deployment outcomes require the target service, intended version, and healthy replica count. Export outcomes require the dataset, row count, approved destination, and redacted status. Constraints require approval on all visible decision events and at most one visible executed receipt. An idempotent replay is excluded from the execution count. The at-most-one constraint intentionally depends on history completeness; a final state alone does not prove that constraint.

The hosted observation verifier checks issuer policy, RS256 signature, audience, subject, task and tenant binding, payload digest, and lifetime. The corpus uses its existing default-compatible age limit, without introducing an epoch mechanism. Rejected observations are removed before evaluation. Their rejection creates unavailable support, not a factual assertion that the task failed.

The local evaluator distinguishes an absent source from an explicitly supplied empty array. An absent source makes its predicate indeterminate. An empty array can satisfy a count upper bound. That behavior is sensible if an empty array certifies a complete stream containing no events; it is unsafe if an exporter silently substitutes an empty array for an unavailable stream. The omission experiment makes this representation issue explicit.

The existing gateway can freeze evidence snapshots and final evaluations. Targeted existing tests cover finalization, retry idempotency, profile issuance, and profile-scoped rollups. Those tests supply architectural context; this paper's repeated local evaluations are not measurements of distributed durability or proof that a frozen snapshot is complete. Freezing preserves the evidence selected, including any omissions already present.

## 5. Experimental Method

### 5.1. Corpus and independent oracle

The artifact contains {{case_count}} cases: three domains, {{scenario_count}} scenario families, and twenty parameterizations per domain-scenario combination. The resulting {{stratum_count}} strata are the unit of fault coverage. Identifiers and domain values vary across parameterizations, while each scenario's structural fault is fixed. All three domains use independently written imperative state checks, although the workflow shapes remain deliberately simple.

The refund emulator maintains refund records with payment, amount, settlement, and approval fields. The deployment emulator maintains release records with service, version, healthy replica count, and approval. The export emulator maintains artifact records with dataset, rows, destination, redaction, and approval. Each oracle checks the complete corresponding history, including its cardinality. Evidence generation reads selected state and records, then applies the labeled intervention. Assessment functions receive a projected input with no world state, scenario name, or oracle label.

The corpus includes {{positive_count}} oracle-positive and {{negative_count}} oracle-negative cases. This class mix is designed for diagnosis and is not intended to resemble deployment prevalence. There are {{per_family}} cases per scenario family. Exact counts are reported without confidence intervals over the parameterizations because these variants are not independent samples of operational failures. Results are also retained separately by domain and scenario.

### 5.2. Configurations

**Tool** maps the final HTTP status to success or failure. **Trace** requires a visible executed receipt and only allow decisions; it abstains if either stream is empty or absent. These intentionally weak controls isolate what can be inferred from transport and execution signals alone. They do not represent the maximum capability of a tracing product.

**Content-any** applies the production task predicates after a research adapter normalizes away provenance, digest, and binding failures. It is an explicitly insecure mechanism ablation, not a recommended ingestion path. **Local-any** calls the unchanged local evaluator on records claiming verified provenance. **Ingress-any** first invokes the unchanged observation verifier and then the same evaluator.

**Ingress-all** uses the same components with universal observation predicates. It receives a separately issued profile and correctly rebound and re-signed evidence; an issued contract is never edited. **Ingress-latest** uses a research-only adapter to select the most recent verified observation before evaluating it. A tied latest timestamp with conflicting values causes abstention. This adapter is not shipped production behavior and assumes the signed observation time is trustworthy.

The outcome observations in this corpus contain all required state fields together, so selecting a latest record is unambiguous. The adapter does not implement distributed version reconciliation, partial-field merging, or a general solution for multiple independent observers. No configuration is advertised as a reproduction of a named prior system.

### 5.3. Metrics and repeated execution

We map the production receipt to S when qualified success is true; to F when any required outcome or hard constraint fails; and to U otherwise. Thus a partial outcome with only missing support is U, while an explicit violated constraint can justify F despite a missing outcome. We preserve the original receipt dimensions in the saved assessment records.

For each method, N+ and N- denote oracle-positive and oracle-negative cases. False-success rate is the number of S labels on negative cases divided by N-. False-failure rate is the number of F labels on positive cases divided by N+. Coverage is (number of S plus number of F)/N. Selective error is the number of incorrect decisive labels divided by the number of decisive labels. Positive admission is S on positive cases divided by N+. Undefined rates are represented as null rather than zero.

We ran the entire correctness artifact twice with independently generated keys. Saved cases, normalized assessment outputs, and summaries match byte-for-byte. Source hashes identify the tested production modules and experiment code. Persisted evidence does not include signing keys or JWS envelopes; reproducing cryptographic verification requires rerunning the artifact with fresh keys. The saved data are research observations, not third-party cryptographic attestations of the experiment itself.

### 5.4. Sensitivity and timing

An observation-loss sweep removes observations for a nested subset of parameterizations, identically across clean and accepted-pending cases. Its five loss levels are zero, one quarter, one half, three quarters, and all observations. Each level has {{loss_cases}} cases balanced by oracle label. A separate omission sweep exhausts all eight subsets of the three evidence streams, using both absent and empty representations, over clean and duplicate-visible cases. This yields {{omission_count}} assessments with Ingress-any.

The microbenchmark runs a fixed clean refund case after warm-up, using five sequential blocks per method. Signed envelopes are prepared before timing. Ingress timing includes the production verifier, a local JWKS response, JSON decoding, key import, and evaluation; it excludes signing, network, provider execution, model inference, and durable storage. Hardware and raw samples are saved. Fixed method order and lack of CPU isolation limit fine-grained comparisons.

## 6. Results

### 6.1. Aggregate behavior

Table 1 reports the complete corpus, including the explicitly out-of-model trusted-signer control. These are fault-suite outcomes, not security guarantees. Ingress-any makes {{ingress_fs}} false success claims, compared with {{tool_fs}} for Tool and {{content_fs}} for Content-any. Its coverage falls to {{ingress_coverage}} because invalid or missing observations often warrant abstention. It admits {{ingress_positive}} of {{positive_count}} genuinely successful cases; the missing-success family accounts for the remainder.

{{table_overall}}

**Table 1.** Exact results on {{case_count}} cases. FS/N- and FF/N+ show false-success and false-failure counts with their class denominators. Coverage and selective error expose the cost of abstention. All methods see matched task and evidence content; the universal profile changes observation quantification explicitly.

The verification boundary matters. Local-any rejects the wrong issuer, invalid payload digest, and wrong task binding, but it accepts forged provenance metadata with an invalid signature and observations whose envelope has expired. Ingress-any abstains on those additional families after actual verification. This is evidence for correct composition of the existing components, not evidence that local metadata fields can replace authentication.

Figure 1 exposes every scenario's outcome. All parameterizations and domains produce the same categorical pattern within each scenario-method cell. That consistency is useful as a conformance check and also reveals the corpus's limited behavioral diversity.

### 6.2. Valid signatures do not close all evidence gaps

Five families remain false successes under Ingress-any: conflicting observations, a state regression within the allowed age window, a hidden duplicate receipt, an empty receipt stream, and a lying trusted issuer. Each contributes {{per_family}} false successes. The latter is outside the truthful-producer assumption; the history-omission cases violate completeness, and the temporal cases test how task semantics are expressed.

In the hidden-duplicate case, two effects occur but only one executed receipt is exposed. The provider observation reports the latest resource state, which is correct in isolation. In the empty-stream case, both receipts are omitted and represented as an empty list. The count upper bound passes in both cases. Authentication of the state observation cannot establish the cardinality of a separate history.

The within-TTL regression is also revealing. A truthful successful observation is collected before the world changes. Its signature and age remain valid when evaluated, but its statement no longer establishes the current outcome. Clock-based freshness bounds observation age; it does not prove the absence of an intervening state transition. The epoch approach in EvidenceNet addresses a different freshness assumption [@evidencenet]. We do not implement that approach here.

{{figure_matrix}}

**Figure 1.** Scenario-level assessment matrix. S, F, and U indicate success, failure, and abstention. Red S/F cells disagree with oracle truth; gray cells abstain. Each cell summarizes {{per_family}} structurally related cases, not independent trials.

### 6.3. Quantifier and temporal-policy tradeoffs

For a success observation followed by an observed regression, existential predicates accept the earlier positive evidence. Universal predicates reject this mixture. However, universal predicates also reject a legitimate pending-to-success transition because the earlier negative record remains in the evidence set. Ingress-all therefore exchanges {{policy_delta}} false success claims for {{policy_delta}} false failure claims in the corpus; its selective error is unchanged from Ingress-any.

Ingress-latest resolves both represented transitions correctly, reducing false success to {{latest_fs}} while retaining zero false failures in this corpus. It still accepts the within-TTL regression when no later observation exists, omitted histories, and the trusted falsehood. The result supports temporal policy selection for a narrow state model; it does not establish latest-write-wins as a generally sound completion rule.

### 6.4. Observation loss and empty streams

The loss sweep reveals an unavoidable information tradeoff. With complete outcome observations, Ingress-any separates clean and accepted-pending states. As observations are removed, its coverage falls linearly to zero while it makes no false decisive claims in this balanced subexperiment. Tool remains fully decisive with {{loss_tool_error}} selective error because the same successful transport response accompanies both labels. At total observation loss, each positive/negative pair exposes the same assessment input, as in Section 3.3.

{{figure_loss}}

**Figure 2.** Coverage and selective error as paired outcome observations are removed. Selective error is undefined at zero coverage and is not plotted there. The sweep characterizes designed information loss, not a natural missing-data distribution.

The stream sweep shows a distinct representation hazard. When only the receipt source is absent, Ingress-any abstains on all {{omission_cell_count}} clean/duplicate cases. When the same source is supplied as an empty array, it instead returns success on all of them, including {{omission_empty_fs}} duplicate cases. The result is specific to a count upper bound and an exporter that does not certify completeness. It does not imply that every empty array should be rejected.

{{table_omission}}

**Table 2.** Receipt-only omission slice of the exhaustive stream sweep. Both representations expose the same remaining decisions and observations. The complete mask matrix is released with the artifact.

### 6.5. Evidence confidence and local cost

Every false success from Ingress-any has evidence-confidence equal to one. The implementation's field counts determinate predicates and present requirements; it is not a probability that the conclusion is correct. This is consistent with its arithmetic definition but makes calibration language inappropriate. Any dashboard using the field should preserve that distinction.

The measured machine was {{timing_cpu}} running {{timing_platform}} and Node {{timing_node}}. Table 3 reports local component latency and the actual count of timing samples. These measurements establish that the small fixed workload can be evaluated locally at modest cost. They do not estimate end-to-end agent latency or compare fairly with published performance numbers on other hardware and workloads.

{{table_timing}}

**Table 3.** Local fixed-case microbenchmark in milliseconds. Each method has {{timing_n}} measured calls after warm-up. The very small Tool and Trace measurements include timer and loop overhead. Differences among the three ingress variants should not be interpreted as stable performance rankings. Raw blocks, input byte counts, and envelope sizes are available in the artifact.

## 7. Implications for Completion Contracts

**Specify evidence completeness separately from presence.** A source being supplied is not equivalent to a complete account of that source. A stronger contract could require a provider-issued range, sequence closure, a count commitment, or a reconciled state query. Such mechanisms must state which effects can bypass the reporting path. Merely adding another field or signature does not prove coverage.

**Specify temporal scope.** A predicate can concern a past event, current state, or an interval invariant. Those meanings require different aggregation. Existential evaluation is reasonable for evidence that an event happened at least once. A current-state claim needs a valid observation after relevant changes. An interval invariant needs coverage of the interval; neither selecting the latest sample nor requiring all received samples to pass proves that coverage.

**Preserve abstention.** Missing evidence should remain visible in both individual assessments and aggregate reporting. An unknown case should not disappear from the denominator, be labeled a business failure, or be counted as successful simply because no violation was recorded. The loss experiment provides matched examples for all three mistakes.

**Keep verification at the boundary.** The distinction between Local-any and Ingress-any demonstrates a composition obligation. Caller-provided provenance metadata cannot authorize itself. Conversely, an authenticated issuer's statement should not be treated as an independently established fact when the issuer's collection process or truthfulness lies outside the trust assumptions.

**Freeze definitions and evidence without overstating what freezing proves.** Versioned profiles make like-for-like assessment possible, and a frozen snapshot makes a particular assessment repeatable. Neither repairs a poorly specified goal nor supplies missing events. The artifact isolates these properties instead of treating one signed final score as evidence of all of them.

## 8. Limitations and Threats to Validity

This is an implementation case study on deterministic in-memory emulators. It contains no live customer workloads, LLM-generated tool trajectories, provider sandbox transactions, multi-host races, or independently authored benchmark tasks. Its domain models are small and share a common one-effect workflow. Parameter variations test consistency across identifiers and values, not broad task generalization. Results should be interpreted at the scenario-family level.

The same project produced the implementation, profiles, scenarios, and research artifact. The oracle is separated in code and reads complete state, but it is not an independent organization's adjudication. The harness and oracle may share conceptual mistakes. Tests check projected input isolation and retain counterexamples, but external reproduction and externally authored tasks would provide stronger validation.

The corpus intentionally overrepresents failures and includes violated trust assumptions. Pooled false-success percentages depend on that mix. A different weighting changes the reported percentage without changing any mechanism. For this reason we release case-level results and the full scenario matrix and make no population-level claim. An actual deployment's permitted worlds and completeness guarantees would need separate evaluation.

The baseline methods are transparent mechanism controls, not production configurations of tracing platforms or named research systems. They were selected to isolate evidence capabilities and can be strengthened. The study therefore cannot demonstrate superiority to EvidenceNet, AgentSpec, CONTINUITY, or Proof of Execution. It also cannot establish that the listed failure families are novel individually.

Authentic signatures were checked, but key discovery was local and keys were ephemeral. The experiment does not measure TLS, JWKS caching, rotation, revocation, remote issuer availability, credential compromise, or durable evidence ingestion. It signs observation statements only; decision and receipt authenticity are assumed. Latest-observation selection trusts timestamps and handles only the single-observer full-state shape exercised here.

Correctness reruns are deterministic, while timing is not. The microbenchmark excludes network, provider, and model costs, uses fixed method order, and does not isolate the CPU. Its precision should not be mistaken for portability. The study reports current-state truth at the chosen assessment point, not eventual success, causal responsibility, or permanent satisfaction after that point.

## 9. Conclusion

The experiments identify distinct limits of evidence-based completion assessment. Outcome predicates improve on transport and execution signals, and verified ingestion rejects evidence that metadata checks alone cannot authenticate. Nevertheless, authentic input can remain incomplete or temporally inadequate. Treating every historical observation as a current-state condition trades one error for another, while abstention is required when opposite worlds expose identical evidence. AgentAction supplies an existing implementation in which these boundaries can be reproduced. The released artifact makes both successful checks and surviving false completion claims inspectable, providing a concrete basis for stronger completeness and temporal contracts.

## Reproducibility, Disclosure, and Author Responsibility

The artifact is in the AgentAction repository under `research/completion-assessment` [@artifact]. The evaluated production base is recorded in the result manifest, with hashes for the exact evaluator and observation-verifier files. The protocol, generators, oracle, tests, normalized case records, row-level decisions, summaries, timing samples, and manuscript builder are included. The correctness experiment requires Node.js with TypeScript stripping support; it uses no third-party runtime package and makes no external calls. The manuscript and plots use pinned Python dependencies.

The author is affiliated with AgentAction.dev and has a direct interest in the evaluated project. AI-assisted tooling was used to inspect code and literature, implement the experimental harness, analyze outputs, and prepare this draft. It is not listed as an author. This draft has not undergone independent peer review; the human author must review and take responsibility for the final submitted content. All evaluated records are synthetic and no customer data or production credentials are included.

## References

{{references}}
