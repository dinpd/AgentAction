# Transparent agent builder

Transparency and auditability are the organizing product theme. Each agent must
make its configured behavior, permitted actions, actual execution and outcome
evidence inspectable. The builder extends AgentAction's trust lifecycle.

## Delivery sequence

1. **Inspectable social scanner** ([#347](https://github.com/dinpd/AgentAction/issues/347)):
   versioned descriptive contract, typed step connections, frozen instructions
   and settings, and read-only step evidence. Retain candidate decisions and
   disclose unavailable historical evidence. Existing server code executes the
   procedure; the descriptive contract does not execute user wiring.
2. **Executable bounded definition** ([#356](https://github.com/dinpd/AgentAction/issues/356)): make the same validated definition
   authoritative for supported execution. Pin revisions, preserve approval
   boundaries and prove interruption/retry behavior before introducing edits.
3. **Editable behavior**: expose scope, instructions, supported mappings,
   delivery, limits and bounded branches. Show revision diffs and changes to
   authority. Validate on the server; changes require appropriate fresh trials
   and approval. Workspace policy remains the authority ceiling.
4. **Compare and activate**: evaluate revisions against retained samples with
   external actions disabled. Separate recorded playback from fresh AI
   computation. Review the exact revision, authority, results and unresolved
   evidence gaps before activation.
5. **Prove reuse with Website Health**: exercise deterministic observations,
   persistent state, conditional findings and notifications alongside social
   research's AI assessment. Generalize only capabilities demonstrated by both.

## Product surfaces

Definition shows configured steps and connections, input/output types,
instructions, bindings, destinations, limits and failure behavior. Runs uses
the same step identities to show recorded evidence and explicit missing data.
Changes will correlate revisions, editors, trials, approvals and activation.

Proposal, authorization, approval, execution, provider response, observation and
assessment remain distinct. Evidence identifies its provenance and retained
scope. Runtime digests are not signed provider receipts or independent outcome
verification. Record declared explanations and sources, not private model
reasoning. Access controls, redaction and retention apply throughout.

## Boundaries and release gates

Initial building blocks remain bounded retrieval, assessment, decisions,
approval, actions and evaluation. Defer arbitrary scripts, unrestricted loops,
generic transformation libraries and a broad connector marketplace. MCP tools
provide external capabilities.

An auditor must identify a run's revision, authority, recorded action and
evidence. Old runs retain their original definitions. Missing retrieval cannot
be called successful zero-result search; AI assessments cannot be presented as
independent verification. Interrupted side effects remain uncertain when the
provider cannot prove their disposition. Inspection performs no execution.

Every software milestone starts with an issue and acceptance checks, then
follows issue-to-merge and the repository release process. This first milestone
adds optional contract and candidate evidence fields without rewriting legacy
records. Legacy workflow snapshots remain explicitly unavailable.

## Legacy Compatibility And Cleanup

Existing social scanners without a workflow snapshot, or with the supported v1
descriptive snapshot, retain their compatibility execution path. They are not
broken merely because they lack the newer step journal. Historical runs keep
their frozen definition and explicitly disclose missing evidence; never
retroactively manufacture a journal.

To adopt executable v2, a workspace owner opens the saved research settings and
selects **Capture workflow snapshot**. Review any connection-reuse consent and
save the bounded scope. This creates the current executable definition, clears
previous activation and trial eligibility, and cancels pending runs. Run and
approve a fresh trial, review its actual evidence and accepted report, then
activate the new revision. Do not transfer old scheduling approval across the
upgrade.

Supervised MCP agents and built-in recurring agents still use their own
supported runtimes. Do not remove them, their recipes or compatibility code
solely because they are not on the social scanner's executable contract.
For an actually incompatible live agent, identify its definition, connection,
failure and affected pending work first. Prefer pausing it and keeping its run
history until it can be upgraded and retried. Permanent deletion is a separate,
explicit decision, not an automatic migration step.

The localhost workflow preview serves synthetic fixtures, not live workspace
data. It is read-only: trials, saves, scheduling and delivery are disabled.
Use the live console for real trials and upgrades. The synthetic preview's
rejected write requests are not evidence of legacy runtime incompatibility.
