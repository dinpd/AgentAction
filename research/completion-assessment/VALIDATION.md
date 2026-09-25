# Validation record

Research artifact for issues #289, #298 and #300. Release classification: no release.

## Original artifact checks (issue #289)

- Seven research tests pass: state-based oracle, identical exposed inputs with
  opposite truth, frozen profiles, actual cryptographic ingress rejection,
  retained semantic counterexamples, latest-observation ties, and denominators.
- Primary experiment: 1,200 cases and 8,400 assessments. Two complete runs with
  independently generated signing keys produce identical non-timing artifacts.
- Observation-loss sweep: 4,200 assessments. Exhaustive stream-omission sweep:
  1,920 assessments. Independent Python implementation recounts every summary
  from saved rows and independently rechecks state-based truth.
- All 37 existing guard tests pass with the prescribed `tsx` test command;
  the guard TypeScript build passes.
- Six selected existing gateway tests pass: finalization and replay, frozen
  profile issuance, profile-scoped rollups, trusted OIDC observations, signed
  JWS observations, and unsigned-development restrictions.
- Manuscript numbers and tables are generated from measured data. Python checks
  source/data hashes, reference keys, retained false-success counterexamples,
  timing sample statistics, rendered PDF text, and page bounds.
- The 11-page review PDF was rendered and visually inspected on every page.
  LaTeX source compiles using Tectonic 0.17.0; no overfull boxes or unresolved
  references were reported. This is a source compilation check, not a claim
  that its pagination matches the separate review PDF.
- `git diff --check` passes. A scoped scan of the research tree found no private
  keys, common token patterns, cloud access keys, or private workspace paths.
  No private key or signed observation envelope is saved by the experiments.
- Guard dependency audit reports no vulnerabilities. The research Node code has
  no package dependencies. Python rendering dependencies are pinned; no claim
  is made that pinning is a vulnerability audit.

## Tooling limits

A supplementary standalone strict TypeScript check includes the existing
Cloudflare observation verifier under generic Node/DOM types. It reports two
pre-existing type incompatibilities (`JsonWebKey.kid` and typed-array
`BufferSource`) in that unchanged file. The experiment itself runs through
Node's native TypeScript stripping; its tests and the production guard's own
configured build pass. No production typing or behavior was changed to make
this supplementary command pass.

The initial attempt to run existing guard tests with native type stripping was
inappropriate for the guard's `.js` import mapping; rerunning its prescribed
`npm test` with locked dependencies passed. These tooling failures are not
omitted from the record.

## Persistent-service extension (issue #298)

- Nine Node tests pass, including the original seven and a service test that
  exercises every new scenario and all five methods. Additional checks cover
  cross-contract proof rejection, independent oracle isolation, normalized
  replay, sequence/content commitments, and the as-of-time boundary.
- Final corpus: 31 scenario families x 5 variations = 155 cases and 775
  assessments. Within assumptions: 145 cases, 75 positive and 70 negative.
  Combined gate: zero wrong decisive labels, 70 decisive results, 75 unknowns,
  and 35 admitted true successes. All 10 violated-trust cases are false success.
- The Python verifier independently recomputes truth from raw table exports,
  checks every finite-domain reference label, recounts all summaries, checks
  source/data hashes, and recomputes timing percentiles from raw samples.
- Actual local HTTP tests verify overlapping requests using barriers, a snapshot
  returned while a writer is uncommitted, lost responses after commit, persistent
  idempotency after process termination, and atomic rollback on a pre-commit kill.
- The standalone strict TypeScript command reports only the same two existing
  Cloudflare type incompatibilities recorded above; new research type errors
  found during development were corrected.
- Final non-timing outputs reproduce byte-for-byte across fresh runs of both
  suites, including fresh service challenges and RSA keys. The original case,
  assessment, sensitivity, and timing data are unchanged; its manifest updates
  only the metrics type signature and package-script hashes.
- All 37 existing guard tests and the guard's configured TypeScript build pass.
- The 15-page review PDF passes text, bounds, reference, and numeric checks.
  All pages were rendered; layout review corrected a table-heading break and
  consolidated references onto their own page. The final TeX compiles without
  warnings or unresolved references. PDF and TeX pagination can differ.
- Scoped secret/private-path scanning found no matches. Manual review covered
  loopback-only addressing, bounded HTTP bodies/responses, parameterized SQL,
  child-process ownership/cleanup, temporary-database lifetime, and ephemeral
  signing keys. No dependency or production permission changes were introduced.
  The local fixture's fault-control endpoints are intentionally test-only.

### Development refinements and limits

The initial loopback test was blocked by the filesystem/network sandbox's socket
restriction; running the same test with permission for the local listener passed.
No external provider endpoint is used.

Pilot runs exercised 29 and then 30 families. A crash-before-commit case was
added to verify atomic rollback, and an unapproved-retry case exposed an oracle
definition ambiguity during review: the contract requires approval on every
request, while the first service oracle checked the effect alone. The final
oracle also checks all request approvals. Both cases are retained in the final
31-family corpus. Earlier findings about unknown outcomes and trust-violation
false successes remain visible; no failing family was removed to improve a score.

After revising the abstract, the PDF verifier caught a missing total primary
assessment count. The count was restored in the methods section. Bibliography
access dates are omitted at the author's request.

The expected challenge belongs to trusted collector state. The low-level gate
is not a remotely exposed API that can trust an arbitrary caller's expected
nonce. The live collector generates a fresh challenge before each head read;
the frozen-evidence comparison evaluates all methods at that recorded point.
The gate does not lock state, reserve future effects, or authorize an atomic
downstream transaction. Timing uses a small clean task; it does not measure
large histories, contention, external provider latency, TLS, or remote JWKS.

## Scientific scope

These are synthetic finite-corpus measurements, not field deployment results,
independent deployment samples, or official agent-benchmark scores. The framework
extension executes an upstream DB grader under controlled evidence interventions. A
separate author review and independent technical review are still appropriate
before submission. No arXiv submission or claim of peer review is made.

## Evaluator framework extension (issue #300)

- Ten Node tests pass, including full truth/verdict cells, positive abstention in
  recall/F1, undefined denominators, and an adapter scorecard integration test
  with separate trust strata and invalid-input rejection.
- Original emulator and service verdict files remain byte-identical to #298.
  Expanded summaries/manifests reproduce with fresh keys/challenges. A separate
  Python recount checks every added metric. The combined gate improves precision
  (65.0% to 77.8%) but lowers recall (86.7% to 46.7%) and F1 (74.3% to 58.3%).
- External validation pins sierra-research/tau2-bench at
  b7ea9074c1cba482b30687fecdb5c8425fd6f619 and invokes unchanged retail tools,
  environment and EnvironmentEvaluator.calculate_reward. It measures DB match,
  without dialogue generation, model calls or a full official benchmark score.
- Of 114 base tasks, the declared rule retains 91 and excludes 23: ten lack
  mutating actions, thirteen return a tool error in scripted replay. Every ID
  and error is released. Selection never depends on assessor accuracy. Eight
  conditions yield 728 cases and 2,184 assessments.
- A clean environment with 19 pinned offline dependencies reproduces selection,
  upstream source/data hashes, raw traces/state changes, verdicts and summaries
  byte-for-byte. The independent standard-library verifier audits traces,
  state-delta truth, wrapper decisions, metrics and hashes. Saved-data audit and
  full upstream replay are distinct checks, and CI runs both.
- Upstream convenience initializers eagerly import optional voice runners. The
  adapter supplies search paths for two packages, while substantive modules run
  unchanged. This is disclosed. An initial Python 3.10 dependency install failed
  the upstream version constraint; final runs use Python 3.13. Final replay needs
  no model/voice packages. Socket connections and dotenv loading are disabled.
- All 37 existing guard tests and its configured TypeScript build pass.
- The 18-page review PDF passes numeric, text, reference and page-bound checks.
  Every page was rendered and inspected. Tables and four figures are legible;
  LaTeX compiles without warnings or unresolved references. No source access
  dates or removed responsibility sentence are restored. Risk/coverage points
  are discrete policies, not a threshold curve.
- pip-audit of all 19 pinned replay dependencies reports no known vulnerabilities.
  Secret/private-path scanning reports no findings. Manual review covers source
  pinning, public synthetic-data provenance, MIT attribution, direct imports,
  socket blocking, absent credentials, truth isolation, strict replay, complete
  selection accounting, and unchanged production code. Pinning is not a general
  security guarantee. Release impact remains no release (research-only).
