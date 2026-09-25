# arXiv submission fields and upload steps

Files are prepared locally. No arXiv upload, account check or submission has been performed.

## Files to use

- Upload `agent-task-completion-arxiv-source.zip`. It contains `main.tex` and four required PDF figures.
- The bibliography is embedded in `main.tex`; no `.bib` or `.bbl` file is needed.
- `../pdf/agent-task-completion-arxiv.pdf` is the preview compiled from the extracted ZIP.
- Keep this guide, metadata, preview PDF and manifest outside the source upload.
- Code and experimental data are linked through the pinned artifact citation.

## Copyable form fields

**Title**

Can We Trust 'Done'? Evaluating Agent Completion and Requests for Additional Evidence

**Authors**

Dan Itkis (AgentAction.dev)

The manuscript byline is **Dan Itkis, MsETM**, with AgentAction.dev below it.
arXiv's searchable Authors field excludes degree suffixes, so the form value
above deliberately follows its metadata format. [Author-field rules](https://info.arxiv.org/help/prep.html)

**Abstract** (1387 characters; limit 1,920)

A completion evaluator can be wrong because the evidence it receives is incomplete or stale, even when the task's outcome criterion is valid. We present a reproducible stress-testing protocol that separates complete-state truth from exposed evidence and retains success, failure, and unknown judgments. Standard precision, recall, F1, coverage, and selective error describe both incorrect decisions and successes left unrecognized. The artifact covers 20 fault families in three emulators, 31 HTTP/SQLite families with retries and crashes, and eight interventions on 91 externally authored retail tasks. A closure-and-revision gate reduces false admissions but lowers service recall from 86.7% to 46.7%. We then evaluate bounded additional-evidence requests on 620 paired cases spanning four collection conditions. When collection recovers, full and targeted requests both restore recall to 100.0%; targeted requests use 135 additional provider reads versus 150 for full recollection. Across all conditions, targeted requests achieve 83.0% precision and 65.0% recall, while an acquisition-capable baseline achieves 78.9% and 75.0%. Outages, continuing revision changes, and dishonest or incomplete collection retain important failure modes. The contribution is an executable evaluation protocol and a measured decision/request interface, with explicit acquisition costs and trust limits.

**Primary category recommendation:** cs.AI (Artificial Intelligence).
**Cross-list recommendation:** cs.SE (Software Engineering).
The central application is agent completion assessment; its executable testing
protocol and metrics also fit software engineering. These are recommendations
based on the [category descriptions](https://arxiv.org/category_taxonomy).

**Comments**

22 pages, 4 figures, 10 tables. Reproducible code and data: https://github.com/dinpd/AgentAction/tree/59f324a33fe2fd04ae167e5bbd4cac0330c65c9e/research/completion-assessment

Leave journal reference, DOI and report number blank: none is claimed for this preprint.

**License:** Pending author selection; choose in the arXiv form before submission.

This is a submission preference, not a record of a license selected on arXiv.
See [arXiv's license choices](https://info.arxiv.org/help/license/index.html).

## Upload sequence

1. Sign in to arXiv and start a new submission. Select the category; complete
   endorsement if the account requests it. Account/endorsement status has not
   been checked. [Endorsement help](https://info.arxiv.org/help/endorsement.html)
2. Select the author's chosen license and supply the fields above.
3. Upload the ZIP, select `main.tex`, and use **XeLaTeX, TeX Live 2025**.
   The local preview uses Tectonic's XeTeX engine; it is not a run on arXiv's
   server or an exact reproduction of its TeX Live installation.
4. Process the source and inspect arXiv's generated PDF, especially the byline,
   four figures, ten tables and 18 bibliography entries. Use the local preview
   for comparison. Resolve any processing errors before finalizing.
5. Review the metadata and finalize the submission when ready. Files being
   locally prepared does not establish acceptance or publication by arXiv.

[TeX source requirements](https://info.arxiv.org/help/submit_tex.html) and
[supported processors](https://info.arxiv.org/help/faq/texlive.html).
