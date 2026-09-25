# Completion-assessment research artifact

**Paper:** *Can We Trust 'Done'? Evaluating Agent Completion and Requests for
Additional Evidence* - Dan Itkis, MsETM, AgentAction.dev.

This research draft presents a completion-assessor evaluation framework with
an emulator suite, a local persistent HTTP service, and an external retail
database-outcome replay adapter. It is not an arXiv submission or a production feature. Release
impact: **no release**. Production evaluator and gateway code are unchanged.

- [Read the manuscript](paper/manuscript.md)
- [Review PDF](output/pdf/agent-task-completion.pdf)
- [Editable LaTeX](paper/manuscript.tex)
- [Framework, metrics, and external protocol](FRAMEWORK_PROTOCOL.md)
- [Bounded evidence-request experiment](EVIDENCE_REQUEST_PROTOCOL.md)
- [Reuse guide and scoring example](SCORING_GUIDE.md)
- [Evidence-request results](results/requests/summary.json)
- [External task results](results/external/summary.json)
- [External selection and exclusions](results/external/selection.json)
- [Original evaluation protocol](PROTOCOL.md)
- [Remedy and persistent-service protocol](REMEDY_PROTOCOL.md)
- [Related-work and claim audit](RELATED_WORK.md)
- [Original results](results/summary.json)
- [Service results and ablations](results/service/summary.json)
- [Original source/data hashes](results/manifest.json)
- [Service source/data hashes](results/service/manifest.json)
- [Evidence-request source/data hashes](results/requests/manifest.json)

## Reproduce correctness

Use Node.js 22.14 or newer with TypeScript stripping and Python 3.12 or newer
with standard-library SQLite. From this directory:

```sh
npm test
npm run check
python3 verify_results.py
```

No npm installation is needed. `check` regenerates all three local suites with fresh
signing keys and compares non-timing artifacts byte-for-byte. The service suite
also generates fresh challenges, normalized in saved data. `experiment`
overwrites the original results; `service:experiment` overwrites the service
results. Use those commands only when updating the artifact. `service:check`
checks just the service suite; `requests:experiment` and `requests:check` do the
same for evidence requests. The independent Python verifiers use the
standard library unless `--pdf` is supplied.

All three local experiments invoke the existing TypeScript evaluator and JWS observation
verifier. A fetch substitute serves only a public ephemeral JWKS at an exact
`.invalid` URL; every other fetch request throws. The service driver uses
Node's HTTP client strictly against 127.0.0.1, separately from the JWKS fixture.
It needs permission to bind a temporary local port and uses a temporary SQLite
database, removed on completion. Set `RESEARCH_PYTHON` to a Python executable
path if `python3` is unavailable. No external provider, LLM, production
credential, customer record, or real payment is used.

The emulator oracle sees complete state. The service auditor is a separate
read-only Python process querying SQLite directly. Assessment functions receive
neither oracle labels nor database tables. Private keys and JWS envelopes are
never persisted. Saved challenges use case-specific markers with recomputed
head digests; stored records cannot independently reverify past signatures.
Rerunning performs actual signing and verification with fresh keys.

The service gate checks history closure and/or a final resource revision. Its
expected challenge is trusted local collector state, not a field to accept from
an untrusted evidence submitter. The claim is as of the final head read, not
permanent validity or atomic authorization of a subsequent action. The
prototype is not a production endpoint.

## Reuse the scorecard

An adapter emits an envelope with `schema_version: 1`, an explicit `methods`
roster, and `rows`. Each row requires `id`, `truth` (boolean), `label` (`S`, `F`,
or `U`), `method`, `scenario`, and `assumptions_hold` (boolean). The scorer rejects
missing method/case results, duplicates and inconsistent truth/scenario/trust
metadata. This replaces the earlier research raw-array interface. See
SCORING_GUIDE.md for a complete runnable example. Score through standard input:

```sh
node --experimental-strip-types src/score_assessments.mts < adapter-batch.json
```

The output includes full-corpus, trust-stratum and per-scenario summaries. Never
send truth or fault names to the assessor itself; attach them only afterward for
scoring. Positive unknowns count as successes not admitted for recall/F1 while
remaining separate from explicit false failures. See FRAMEWORK_PROTOCOL.md for
formulas, undefined denominators and interpretation limits.

## Reproduce external retail replay

The adapter uses 91 of 114 externally authored retail tasks and eight declared
conditions per task (728 cases, 2,184 assessments). Ten tasks have no mutating
action; thirteen return tool errors in the scripted replay. Every exclusion is
recorded. The unmodified upstream environment and database-state evaluator run
locally; no LLM or dialogue is generated. This measures the DB component, not
the official full tau-bench score. An additional closure wrapper is our code.

Use Python 3.13 and a separate temporary checkout/environment:

```sh
git clone https://github.com/sierra-research/tau2-bench.git /tmp/completion-tau
git -C /tmp/completion-tau checkout b7ea9074c1cba482b30687fecdb5c8425fd6f619
python3.13 -m venv /tmp/completion-external-venv
/tmp/completion-external-venv/bin/python -m pip install -r external-requirements.txt
/tmp/completion-external-venv/bin/python src/run_external.py --upstream /tmp/completion-tau --check
```

The adapter imports unchanged substantive modules directly from that checkout.
It bypasses two convenience initializers that eagerly import optional voice
runners. It disables dotenv loading and socket connections before upstream
imports. No upstream editable install, API key or production record is needed.
`--check` compares selection, raw traces/state changes, verdicts, summaries and
manifests byte-for-byte; omit it only to intentionally update results. CI runs
this external replay separately. `verify_external.py` independently audits saved
traces, state-delta comparisons, closure handling, metrics and hashes using the
standard library; it cannot replace executing upstream code.

The service remedy raises full-corpus precision from 65.0% to 77.8%, but lowers
recall from 86.7% to 46.7% and F1 from 74.3% to 58.3%. A zero-error, always-unknown
method has no useful coverage. Standard scores and discrete risk/coverage points
expose these costs; neither corpus represents production failure prevalence.

## Reproduce bounded evidence requests

```sh
npm run requests:check
python3 verify_requests.py
```

The study crosses the existing 31 service families and five variants with four
collection conditions (620 cases; 3,100 decisions across five policies). Conditions
are recovered collection, unavailable service, persistent receipt omission and a
state-preserving revision race. The requester may make one round and at most two
snapshot/head GETs. Independent audits confirm fixed truth and unchanged effects
and histories; only the separately scheduled writer can advance the revision.

With recovered collection, full and targeted requests both recognize 75/75 true
successes; targeted requests use 135 provider reads versus 150 and deliver 26.6%
fewer evidence JSON bytes. Across all conditions, targeted precision/recall/F1 are
83.0%/65.0%/72.9%, versus 78.9%/75.0%/76.9% for unconditional latest refresh.
All trust-violation false successes remain. These are constructed mixtures, not
deployment estimates. Provider and broker-to-assessor payloads are measured
separately; headers, signatures, transport overhead and latency are excluded.

`requests:experiment` overwrites request-study results; use it only to intentionally
update the artifact. A second fresh-key replay must then match. `verify_requests.py`
independently checks reference labels, input pairing, request scopes, before/after
state, all read/payload costs, metrics and hashes with Python's standard library.

## Rebuild the paper and plots

Python 3.12 is used in CI. Create an isolated environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r paper/requirements.txt
.venv/bin/python paper/build.py
.venv/bin/python verify_results.py --pdf
```

`paper/manuscript.template.md` is the canonical editorial source. The builder
substitutes measured results and emits Markdown, LaTeX, BibTeX, figures, and a
ReportLab review PDF. Edit the template, not generated files. The LaTeX embeds
its bibliography; `references.bib` is also supplied for venue templates.

```sh
cd paper
tectonic manuscript.tex
```

The TeX rendering can paginate differently from the review PDF. Both contain
the same manuscript and tables. Use the compiled arXiv preview with the source
ZIP for submission, as described below.

## Prepared arXiv submission

- [Source upload ZIP](output/arxiv/agent-task-completion-arxiv-source.zip)
- [PDF compiled from that ZIP](output/pdf/agent-task-completion-arxiv.pdf)
- [Submission fields and upload steps](output/arxiv/SUBMISSION.md)
- [Source package hashes](output/arxiv/manifest.json)

The manuscript displays **Dan Itkis, MsETM**, AgentAction.dev, with a fixed date
and no Research draft label. The arXiv Authors field uses **Dan Itkis
(AgentAction.dev)** because its metadata format excludes degree suffixes.
The metadata guide records the license status; no arXiv upload or submission
has been performed. The experimental artifact citation pins the verified
revision containing the complete four-study results.

After rebuilding the manuscript, regenerate/check the minimal source package:

```sh
python3 paper/package_arxiv.py
python3 paper/package_arxiv.py --check
.venv/bin/python paper/package_arxiv.py --check --pdf
```

Only `main.tex` and its four PDF figures enter the ZIP. All 18 references are
embedded in the source. The packager checks exact source membership, hashes,
citation closure, ASCII metadata and the abstract-length limit, with stable
archive ordering and timestamps. It does not require or include experiment data,
the manuscript builder, a Python environment, compiled manuscript PDF or logs.
The guide, metadata and manifest are intentionally outside the source upload.

Compile an extraction in an otherwise empty temporary directory with
`tectonic --only-cached --untrusted --keep-logs main.tex` after installing the
required TeX bundle, or with XeLaTeX. The released preview was built with
Tectonic 0.17.0 (XeTeX); this is not arXiv's TeX Live server. Inspect arXiv's
own generated PDF during the actual submission. Recompile and reinspect the
preview if the manuscript or figure sources change, and update the compilation
record's archive/PDF hashes and page count. The `--pdf` check binds the saved
preview to that record and checks text, metadata, tables, figures and page bounds;
it does not invoke a TeX compiler. Research CI checks the frozen package and preview
before independently rebuilding the manuscript and plots. Plot PDF bytes can
depend on the rendering platform; the uploaded ZIP uses the inspected, committed
figure files. The ZIP is deterministic for those exact source files.

## Measurements and interpretation

The original suite has 20 scenarios x 3 domains x 20 parameterizations = 1,200
cases and 8,400 primary assessments. These are 60 related strata, not 1,200
independent tasks. The loss sweep has 4,200 assessments and the omission sweep
1,920. Case-level labels remain unchanged; the framework extension adds a six-cell
confusion matrix, completion precision, recall and F1 to every summary.

The service suite has 31 scenarios x 5 parameterizations = 155 cases and 775
assessments. It uses actual HTTP, transactional state/history updates,
controlled overlapping requests, lost responses, process restarts, and crash
rollback. These are synthetic, author-built tasks, not external provider or
customer validation. Within the service trust assumptions, the combined gate
has no wrong decisive labels in 145 cases, at 48.3% coverage and 35/75 positive
admission. All 10 violated-trust controls remain false successes. Overall
summaries include them; no reliability guarantee is implied.

`npm run timing` overwrites the original local microbenchmark: five blocks of
200 calls after 100 warm-ups per method, fixed method order. It includes local
JWKS JSON and key import but excludes signing, network, provider, model, and
storage costs.

`npm run service:timing` records 200 samples per method and scope after 20
warm-ups, with rotating method order. It measures the prepared-envelope gate
and complete local HTTP assessment, including snapshot packing/signing and an
additional head read for revision methods. It excludes task execution,
startup, remote JWKS/TLS, and model inference. Raw samples, source hashes,
environment, and scope are in `results/service/timing.json`. Rebuild the paper
after any timing update. Do not compare these local timings directly with other
papers' end-to-end results.

The corpus deliberately includes violated trust assumptions and retains false
successes. Controls are not implementations of named competing systems.
Independent technical review, natural agent trajectories, and commercial
provider sandbox experiments remain valuable extensions.

## File map

| File | Purpose |
| --- | --- |
| `src/score_assessments.mts` | Reusable JSON-row scorecard for compatible adapters |
| `src/run_external.py` | Pinned upstream retail execution and replay grader |
| `verify_external.py` | Independent saved external-data audit |
| `results/external/` | Task selection, raw traces/state changes, scores, hashes, license |
| `src/world.mts` | Emulator state transitions and oracle |
| `src/cases.mts` | Frozen profiles and emulator evidence interventions |
| `src/methods.mts` | Mechanism controls and actual JWS ingress |
| `src/run.mts` | Original correctness and sensitivity experiments |
| `src/remedy.mts` | Research-only closure and revision gate |
| `src/persistent_provider.py` | Local HTTP service and SQLite transactions |
| `src/audit_provider.py` | Separate read-only database auditor |
| `src/service_cases.mts` | Controlled schedules and evidence interventions |
| `src/run_service.mts` | Service ablations and reproducibility |
| `test/` | Oracle isolation, cryptographic controls, retries, races, and limits |
| `results/` | Original raw worlds, evidence, decisions, summaries, and timings |
| `results/service/` | Service evidence, table exports, decisions, and timings |
| `verify_results.py` | Original recount and manuscript/PDF checks |
| `verify_service.py` | Independent service oracle, reference labels, and recount |

Existing gateway lifecycle checks provide architectural context; they are not
counted as research trials. No arXiv upload is performed by these scripts.
