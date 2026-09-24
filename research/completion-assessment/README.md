# Completion-assessment research artifact

**Paper:** *When Is an Agent Task Complete? A Fault-Injection Study of
Evidence-Based Assessment* - Dan Itkis, AgentAction.dev.

This is an offline research draft and reproducible implementation case study.
It is not an arXiv submission or a new production feature. Release impact:
**no release**. Production evaluator and gateway code are unchanged.

- [Read the manuscript](paper/manuscript.md)
- [Review PDF](output/pdf/agent-task-completion.pdf)
- [Editable LaTeX](paper/manuscript.tex)
- [Evaluation protocol](PROTOCOL.md)
- [Related-work and claim audit](RELATED_WORK.md)
- [Raw result summary](results/summary.json)
- [Source and data hashes](results/manifest.json)

## Reproduce correctness

From this directory, use Node.js 22.14 or newer with TypeScript type stripping:

```sh
npm test
npm run check
python3 verify_results.py
```

No npm installation is needed for the research artifact. `check` regenerates
all cases and assessments with fresh ephemeral signing keys and compares the
non-timing files byte-for-byte with committed results. `experiment` deliberately
overwrites those saved files; run it only when updating the research artifact.
The independent Python verifier uses the standard library unless `--pdf` is
specified. It recomputes ground truth and all summary counts from stored rows.

The experiment invokes the existing TypeScript intent evaluator and JWS
observation verifier. An exact-URL in-process fetch substitute serves only a
public ephemeral JWKS; every other network request throws. No provider, LLM,
credential, production workspace, or customer data is used. The emulator oracle
sees complete state; assessment functions receive a projected evidence view.
Private keys and signed envelopes are never persisted. Stored normalized
records alone cannot reverify a past signature; rerunning performs actual
signature generation and verification again.

## Rebuild the paper and plots

Python 3.12 was used for the saved PDF. Create an isolated environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r paper/requirements.txt
.venv/bin/python paper/build.py
.venv/bin/python verify_results.py --pdf
```

`paper/manuscript.template.md` is the canonical editorial source. It uses
explicit result tokens and citation keys. The builder substitutes saved
measurements and emits Markdown, LaTeX, BibTeX, figures, and a ReportLab review
PDF. Edit the template, not the generated files. The LaTeX uses embedded
bibliography entries; `references.bib` is supplied for reuse in venue templates.
With a TeX toolchain, compile from the paper directory:

```sh
cd paper
tectonic manuscript.tex
```

The TeX rendering can paginate differently from the review PDF. Both contain
the same generated manuscript and measured tables. A final arXiv source bundle
should use one consistent chosen rendering and its compiled PDF.

## Measurements and interpretation

The primary suite has 20 scenarios x 3 domains x 20 parameterizations = 1,200
cases and 8,400 assessments. These are 60 structurally related strata, not
1,200 independently sampled tasks. The loss sweep has 4,200 assessments and
the stream-omission sweep 1,920. See the protocol for all denominators.

`npm run timing` overwrites `results/timing.json` with a local microbenchmark.
It has five blocks of 200 measured calls after 100 warm-ups per method. Timing
includes a local JWKS response and key import but excludes network, signing,
provider, model, and storage costs. Do not compare these numbers directly with
other papers' end-to-end timings. Rebuild the manuscript after any timing update.

The full corpus deliberately includes violated trust assumptions and retains
false successes. No baseline is represented as an implementation of a named
prior system. In particular, the artifact cannot establish superiority to
EvidenceNet or deployment failure probabilities. An independent technical
review, externally authored tasks, and realistic asynchronous provider-state
experiments are valuable extensions before a stronger venue submission.

## File map

| File | Purpose |
| --- | --- |
| `src/world.mts` | Domain state transitions and state-based oracle |
| `src/cases.mts` | Frozen profile issuance and evidence interventions |
| `src/methods.mts` | Mechanism controls, actual JWS ingress, assessment projection |
| `src/run.mts` | Exhaustive primary and sensitivity experiments |
| `test/research.test.mts` | Positive controls, negative controls, oracle isolation, metrics |
| `results/cases.jsonl` | Complete synthetic worlds and exposed evidence |
| `results/assessments.jsonl` | Per-method decisions, rejection reasons, receipt dimensions |
| `verify_results.py` | Independent Python oracle/recount and manuscript/PDF checks |

Existing gateway snapshot/profile/observation checks were also run. They verify
existing behavior and are not counted as new research trials. Human review of
the scholarly claims and author responsibility remains separate from software
artifact validation. No arXiv upload is performed by these scripts.
