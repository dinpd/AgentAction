# Validation record

Research artifact for issue #289. Release classification: no release.

## Completed local checks

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

## Scientific scope

These are synthetic finite-corpus measurements, not field deployment results,
independent task samples, or a reproduction of named competing systems. A
separate author review and independent technical review are still appropriate
before submission. No arXiv submission or claim of peer review is made.
