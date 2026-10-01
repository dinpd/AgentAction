import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "../../site-header";
import "./research.css";
import { ResearchDownloadForm } from "./download-form";

const title = "Can We Trust 'Done'? Evaluating Agent Completion and Requests for Additional Evidence";
const description = "A reproducible evaluation of agent completion judgments, missing or stale evidence, and bounded requests for additional evidence. Research preprint by Dan Itkis, MsETM.";
const pageUrl = "https://agentaction.dev/research/completion-assessment";
const pdf = "/research/completion-assessment/can-we-trust-done-2026-09-25.pdf";
const artifact = "https://github.com/dinpd/AgentAction/tree/59f324a33fe2fd04ae167e5bbd4cac0330c65c9e/research/completion-assessment";
const reviewUrl = `https://github.com/dinpd/AgentAction/issues/new?title=${encodeURIComponent("[Paper review] Can We Trust 'Done'?")}&body=${encodeURIComponent("Paper: https://agentaction.dev/research/completion-assessment\nVersion: September 25, 2026\n\nSection or claim being reviewed:\n\nComment or question:\n\nSuggested correction, supporting evidence, or reproduction details:\n")}`;

export const metadata: Metadata = {
  title: { absolute: `${title} — AgentAction Research` },
  description,
  authors: [{ name: "Dan Itkis" }],
  alternates: { canonical: pageUrl },
  openGraph: { type: "article", title, description, url: pageUrl, authors: ["Dan Itkis"], images: [] },
  twitter: { card: "summary", title, description, images: [] },
  other: {
    citation_title: title,
    citation_author: "Dan Itkis",
    citation_publication_date: "2026/09/25",
    citation_pdf_url: `https://agentaction.dev${pdf}`,
  },
};

export default function CompletionResearchPage() {
  return (
    <main className="completion-research" id="top">
      <SiteHeader />
      <article className="research-article">
        <header className="research-intro">
          <Link className="research-back" href="/#whats-new">Research</Link>
          <p className="research-status">Preprint · Open for community review</p>
          <h1>Can we trust <em>“done”?</em></h1>
          <p className="research-subtitle">Evaluating Agent Completion and Requests for Additional Evidence</p>
          <p className="research-byline"><strong>Dan Itkis, MsETM</strong><span>AgentAction.dev</span></p>
          <p className="research-version">Manuscript version: <time dateTime="2026-09-25">September 25, 2026</time> · 22 pages</p>
          <p className="research-lead">When should an agent say a task is complete—and when should it request more evidence?</p>
          <div className="research-actions">
            <a className="research-primary" href="#download">Get the paper</a>
            <a href={pdf} download>Download PDF</a>
            <a href={artifact}>Explore the experiments</a>
            <a href={reviewUrl}>Submit review comments</a>
          </div>
        </header>

        <section className="research-section" aria-labelledby="abstract-title">
          <p className="research-kicker">Abstract</p>
          <div><h2 id="abstract-title">The study at a glance</h2>
            <p>A completion evaluator can be wrong because the evidence it receives is incomplete or stale, even when the task&apos;s outcome criterion is valid. We present a reproducible stress-testing protocol that separates complete-state truth from exposed evidence and retains success, failure, and unknown judgments. Standard precision, recall, F1, coverage, and selective error describe both incorrect decisions and successes left unrecognized. The artifact covers 20 fault families in three emulators, 31 HTTP/SQLite families with retries and crashes, and eight interventions on 91 externally authored retail tasks. A closure-and-revision gate reduces false admissions but lowers service recall from 86.7% to 46.7%. We then evaluate bounded additional-evidence requests on 620 paired cases spanning four collection conditions. When collection recovers, full and targeted requests both restore recall to 100.0%; targeted requests use 135 additional provider reads versus 150 for full recollection. Across all conditions, targeted requests achieve 83.0% precision and 65.0% recall, while an acquisition-capable baseline achieves 78.9% and 75.0%. Outages, continuing revision changes, and dishonest or incomplete collection retain important failure modes. The contribution is an executable evaluation protocol and a measured decision/request interface, with explicit acquisition costs and trust limits.</p>
          </div>
        </section>

        <section className="research-section" aria-labelledby="question-title">
          <p className="research-kicker">The question</p>
          <div>
            <h2 id="question-title">A completion claim needs enough evidence.</h2>
            <p>An agent can report success while the evidence is incomplete or out of date. Requiring stronger proof can reduce false success claims, but it can also leave genuinely completed tasks unrecognized.</p>
            <p>We evaluate that tradeoff and test whether a bounded request for specific additional evidence can resolve uncertainty without repeating every check. The framework scores success, failure, and unknown judgments against independently checked task state.</p>
            <aside className="research-example" aria-label="Illustrative refund example">
              <p className="research-kicker">For example</p>
              <p>A refund request was accepted, but settlement is unconfirmed.</p>
              <p><strong>Assessment:</strong> Unknown. <strong>Next evidence request:</strong> Check settlement status.</p>
              <p className="research-example-note">A read-only check gathers evidence; it does not issue another refund. Settlement is one required check, not proof that every task constraint was satisfied.</p>
            </aside>
          </div>
        </section>

        <section className="research-section" aria-labelledby="findings-title">
          <p className="research-kicker">What we found</p>
          <div>
            <h2 id="findings-title">Stricter checks trade recognition for assurance.</h2>
            <p>In the service study, a gate that checks history completeness and resource revisions reduced false success admissions, while completion recall fell from 86.7% to 46.7%. Here, recall measures how many successful tasks the evaluator recognized.</p>
            <p>When evidence collection recovered, both full and targeted recollection restored recall to 100.0%. Targeted requests used 135 additional provider reads, compared with 150 for full recollection.</p>
            <p>Those recovery results do not hold across every condition. Across the constructed request-study mix, targeted requests achieved 83.0% precision and 65.0% recall. Outages, continuing changes, and incomplete or dishonest collection retained failure modes.</p>
            <figure className="research-figure">
              {/* Original publication figure, served unchanged without image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/research/completion-assessment/service-outcomes.png" width="1584" height="682" alt="Service study: requiring both history closure and matching revisions reduces false success judgments from 30 to zero, while unknown judgments rise from 15 to 75 across 145 cases within the service trust assumptions." />
              <figcaption><strong>Fewer incorrect claims, more uncertainty.</strong> Each bar covers 145 service cases within the study’s trust assumptions. S means success; F means failure. The combined history-completeness and revision check eliminates false judgments in this subset, but recognizes only 35 successes versus 65 for the initial evaluator. Unknown is an explicit judgment, not an automatic failure. This controlled subset excludes dishonest-collector cases and does not measure real-world agent reliability. <a href="/research/completion-assessment/service-outcomes.png">View full-size figure</a>.</figcaption>
            </figure>
            <p className="research-caveat">These are results for controlled experimental conditions, not estimates of production reliability. The paper reports comparisons, costs, and counterexamples.</p>
          </div>
        </section>

        <section className="research-section" aria-labelledby="scope-title">
          <p className="research-kicker">Evidence & limits</p>
          <div>
            <h2 id="scope-title">What the experiments cover</h2>
            <ul className="research-scope">
              <li><strong>20 fault families</strong> across refund, deployment, and export emulators.</li>
              <li><strong>31 service families</strong> with persistent HTTP/SQLite state, retries, and crashes.</li>
              <li><strong>91 externally authored retail tasks</strong> replayed under eight evidence interventions.</li>
              <li><strong>620 paired request-study cases</strong> spanning four collection conditions.</li>
            </ul>
            <p>The current study contains no live LLM-generated agent trajectories, customer workloads, or commercial provider transactions. External task replay broadens the test environment; it does not measure conversational agent performance.</p>
            <p>The 620 cases reuse the service families under constructed conditions. They are not 620 independent task designs. Validation on real agent runs remains future work.</p>
          </div>
        </section>

        <section className="research-section" id="download" aria-labelledby="download-title">
          <p className="research-kicker">Read the paper</p>
          <div><h2 id="download-title">Download the full study.</h2><ResearchDownloadForm pdf={pdf} /></div>
        </section>

        <section className="research-section" aria-labelledby="reproduce-title">
          <p className="research-kicker">Reproduce the work</p>
          <div>
            <h2 id="reproduce-title">Inspect the protocol, code, and results.</h2>
            <p>The public artifact includes task definitions, complete-state checks, evidence interventions, evaluator decisions, acquisition costs, and rerun instructions.</p>
            <p><a className="research-inline-link" href={artifact}>Completion-assessment research folder</a></p>
            <p className="research-disclosure">The author is affiliated with AgentAction.dev and has a direct interest in the evaluated project. The paper discloses its use of AI-assisted tooling.</p>
          </div>
        </section>
        <section className="research-section" aria-labelledby="review-title">
          <p className="research-kicker">Community peer review</p>
          <div>
            <h2 id="review-title">Help review this preprint.</h2>
            <p>We invite you to participate in peer review by submitting comments on the methods, findings, limitations, or related work. Reproduction reports and counterexamples are especially welcome.</p>
            <p>Please identify the section or claim you are reviewing and include supporting evidence or a suggested correction where possible.</p>
            <p><a className="research-inline-link" href={reviewUrl}>Submit review comments on GitHub</a></p>
            <p className="research-disclosure">Comments are public. A GitHub account is required to submit a review comment.</p>
          </div>
        </section>
      </article>
    </main>
  );
}
