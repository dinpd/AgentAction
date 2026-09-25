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

## Evidence-request extension and review fixes (issue #302)

- The scorer now requires an explicit method roster, unique method/case rows,
  equal case coverage and consistent truth, scenario and trust metadata. Tests
  reject dropped difficult cases, a missing whole method, duplicate rows and
  conflicting metadata while accepting explicit U. All 12 research tests pass.
  The two-case example in SCORING_GUIDE.md reproduces its stated metrics.
- EVIDENCE_REQUEST_PROTOCOL.md was fixed locally before the first new experiment,
  after inspecting the existing service and literature. This is not external
  preregistration. All 31 service families and five variants remain present in
  each of four collection conditions: 620 cases and 3,100 final judgments.
- Separate databases provide matched initial states and evidence for all five
  policies. The auditor confirms unchanged effects, histories and task truth.
  Only the declared external writer advances revision. Acquisition is one round
  of at most two snapshot/head GETs; failed collection does not retry. Tests
  check binding rejection before reads, exhausted round budgets, effect
  preservation, missing-evidence recovery and retained trust failures.
- The independent Python audit checks every initial/final reference label,
  request trigger and scope, provider response, delivered history, before/after
  state, read count, JSON byte count, metric group and source/data hash. Fresh
  signing-key/challenge replays reproduce the non-timing artifacts exactly.
  Signatures themselves are reverified during execution, not from saved files.
- Recovered collection restores all 75 positive admissions for each acquiring
  policy. Targeted requests use 135 reads versus 150 for full recollection and
  26.6% fewer delivered evidence bytes. Under persistent omission, head-only
  requests preserve valid history and recognize 15 more successes than full
  recollection. Across all conditions, Latest refresh retains higher F1 (76.9%
  versus 72.9%); the paper reports that counter-result and an explicit cost
  boundary. All 40 violated-trust cases remain false successes for the gates.
- The original emulator and service data and production sources are unchanged.
  Their replays pass. External replay reproduces all 91 selected tasks, eight
  interventions and 2,184 judgments from the pinned upstream environment. Its
  data are unchanged; its manifest records the scorer-envelope adaptation.
  A new audit verifies the disclosed identical verdict pattern across all tasks.
- All 37 guard tests and its configured TypeScript build pass. The standalone
  strict research check reports only the two previously documented Cloudflare
  type incompatibilities; the extension introduces no additional type errors.
- The 21-page review PDF passes text, numeric, reference and page-bound checks.
  Every page was rendered and visually inspected; all ten tables and four
  figures are legible. LaTeX compiles without warnings or unresolved references.
  Access dates and the removed author-responsibility sentence remain absent.
- Five primary-source references strengthen evaluator-audit, active information
  acquisition and test-oracle positioning. The paper claims neither a new
  general theory nor an optimal acquisition policy. AgentAction provides one
  implementation of the generic decision/request boundary; this is not a new
  public SDK or production endpoint.
- Scoped secret/private-path scanning found no credentials or private paths.
  Manual review covered task/resource binding, fixed read scopes, trusted budget
  ownership, truth isolation, unchanged effects, bounded local responses and
  process cleanup. No production code, dependency, credential or permission
  change is included. Release impact remains no release (research-only).

During development, an initial logical timestamp exceeded the fixture's fixed
assessment time; correcting the acquisition timestamps restored the intended
freshness checks before the first full corpus run. Type checking also caught an
optional contract digest and mutation through a readonly receipt type; explicit
digest validation and a copied receipt slice resolved those issues. Neither
change relaxes an evaluator check or removes a failing case.

The request corpus measures controlled collection schedules on known service
families, not held-out generalization or operational prevalence. JSON payload
counts exclude signatures, headers and transport overhead. The state-preserving
race intentionally measures conservative invalidation without new task failure.
False S judgments do not trigger on-unknown requests. Independently trusted
collection and complete mediation remain deployment assumptions.

## arXiv preparation (issue #304)

- The byline and PDF author metadata now read Dan Itkis, MsETM. Research draft
  labels are removed from the title, headers and metadata; the fixed date is
  retained. The disclosure now refers to the manuscript/work. Scientific claims,
  all experimental code/data, result values and four figures are unchanged.
- The experimental artifact citation pins the verified research revision
  59f324a33fe2fd04ae167e5bbd4cac0330c65c9e rather than a moving main branch.
- The deterministic ZIP contains exactly main.tex and four referenced PDF
  figures. All 18 bibliography entries are embedded. Package validation checks
  exact membership, source hashes, safe relative names, absence of hidden or
  auxiliary files, complete citation resolution and matching title/abstract.
  The abstract is ASCII and contains 1,387 characters (arXiv limit: 1,920).
- A new empty temporary directory received only the ZIP's five files. Tectonic
  0.17.0 compiled main.tex with only cached resources and untrusted mode, producing
  a 22-page PDF without LaTeX warnings, overfull boxes, missing characters or
  unresolved references. The engine is XeTeX; this is not arXiv-server validation
  or a reproduction of its exact TeX Live installation. The guide recommends
  XeLaTeX/TeX Live 2025 and requires inspecting the server-generated preview.
- All 22 compiled-preview pages and all 21 updated review-PDF pages were rendered
  and visually inspected. Page bounds, metadata, tables, figures and key numeric
  claims pass automated checks. The compilation record binds the source ZIP and
  preview hashes. The PDF check verifies that record and its page count; it does
  not itself rerun TeX. CI also checks the deterministic package and saved preview.
- All four independent saved-result audits pass. Whitespace/patch checks and
  Python compilation pass. No new experiment measurements, production changes
  or dependency changes are introduced. Release impact: no release.
- Manual security review covers the explicit source/figure allowlist, relative
  paths, symlink rejection, fixed ZIP metadata, absent arbitrary input/include
  files, no subprocess/network calls in the packager, and untrusted cached-only
  TeX compilation. Scoped secret/private-path scanning found no credentials or
  private paths in the release artifacts.
- Submission metadata uses Dan Itkis (AgentAction.dev), respecting arXiv's
  prohibition on degree suffixes in the searchable Authors field; the manuscript
  preserves the requested credential. cs.AI with cs.SE cross-list is a category
  recommendation. License status is explicitly pending author selection. No
  upload, account/endorsement check, acceptance of terms or arXiv submission has
  been performed.

Preparation follows the official [TeX-source instructions](https://info.arxiv.org/help/submit_tex.html),
[metadata rules](https://info.arxiv.org/help/prep.html),
[processor list](https://info.arxiv.org/help/faq/texlive.html),
[license choices](https://info.arxiv.org/help/license/index.html), and
[endorsement guidance](https://info.arxiv.org/help/endorsement.html).
