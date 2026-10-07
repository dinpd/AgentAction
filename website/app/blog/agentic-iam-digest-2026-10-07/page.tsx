import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts[0];
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  nist: "https://www.nist.gov/news-events/news/2026/09/comments-software-and-agentic-ai-identity-concept-paper",
  sailpoint: "https://investor.sailpoint.com/node/8276/pdf",
  rsa: "https://www.rsa.com/news/press-releases/rsa-agent-id-world-summit-ai/",
  vault: "https://arxiv.org/abs/2609.33371v1",
  intent: "https://arxiv.org/abs/2610.03213v1",
  authorship: "https://arxiv.org/abs/2609.30614v2",
  labels: "https://arxiv.org/abs/2610.04544v1",
  crowdstrike: "https://www.crowdstrike.com/en-us/blog/crowdstrike-announces-agentic-identity-provider/",
  proofpoint: "https://www.proofpoint.com/us/blog/ai-security/identity-was-built-answer-who-agentic-workspace-also-needs-what-and-why",
};

export const metadata: Metadata = {
  title: post.title,
  description: post.description,
  alternates: { canonical: url },
  openGraph: { title: post.title, description: post.description, type: "article", url, publishedTime: post.date, authors: ["AgentAction"], images: [{ url: post.image, alt: post.imageAlt }] },
  twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [post.image] },
};

export default function Digest() {
  const structuredData = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title,
    description: post.description, datePublished: post.date, dateModified: post.date,
    author: { "@type": "Organization", name: "AgentAction", url: "https://agentaction.dev" },
    publisher: { "@id": "https://agentaction.dev/#organization" },
    image: `https://agentaction.dev${post.image}`, mainEntityOfPage: url,
  };
  return <main id="blog-content" className="blog-article">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <a href="/blog" className="blog-back">All posts</a>
    <article>
      <header className="blog-article-header">
        <p className="eyebrow">Agentic IAM digest / Issue 01</p>
        <h1>Identity moves into<br />the execution path.</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. NIST moves toward an implementation demonstration, identity vendors announce controls on agent actions, and researchers test what permission checks miss.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>October 7, 2026</time></span><span>8 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>Identity, bounded authority, and evidence along the action path. Original AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <p>Agentic identity and access management (IAM) covers the identities, delegated authority, and access controls of software agents that select tools and act on behalf of people or organizations. This edition covers September 25 through October 7 inclusive—a 13-day window—and uses primary-source publication or revision dates.</p>
        <div className="blog-callout"><p><strong>The signal this issue:</strong> an agent directory is becoming the starting point for a wider control system. The new announcements and papers emphasize what happens after authentication: limiting privileges, evaluating individual calls, keeping credentials outside model context, and retaining evidence of authority.</p><p>That is our reading of the evidence. Announced capabilities, planned availability, and research findings have different levels of maturity.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / In the reporting window</p><h2 id="new-title">What changed</h2>
          <h3>September 29 · NIST selects DevSecOps as its first implementation use case</h3>
          <p>NIST’s National Cybersecurity Center of Excellence published a summary of feedback on its software and agent identity initiative, drawing on more than 600 commenters. Its Secure Software Development project will supply the first environment for demonstrating agent identification, authentication, and authorization across the software development lifecycle. A new resource hub supports rolling feedback; additional use cases remain to be scoped.</p>
          <p><strong>Why it matters:</strong> the discussion is moving toward a concrete environment where identity controls can be demonstrated. For engineering agents, the interesting boundary is the authority to read code, modify it, run a pipeline, or publish an artifact. The September update is a project milestone, not a completed implementation or a new mandatory standard.</p>
          <p className="blog-source"><a href={sources.nist}>NIST project update · September 29, 2026</a></p>

          <h3>October 6 · SailPoint connects governance to runtime controls</h3>
          <p>At Navigate, SailPoint announced expanded Agentic Fabric capabilities spanning shadow-agent discovery, runtime authorization, lifecycle controls, and agent shutdown. The announcement also describes just-in-time provisioning and exportable audit evidence, alongside agents intended to monitor activity and adjust privileges.</p>
          <p><strong>Availability:</strong> SailPoint says capabilities across Agentic Fabric, Human Fabric, and Atlas begin rolling out at Navigate. A-ISPM, the Harbor Pilot Policy Agent, and the Proofpoint integration are expected in Q4 FY27. The Entro integration is described as nearing completion. Those are distinct rollout commitments, not evidence that every announced feature is generally available now.</p>
          <p><strong>Why it matters:</strong> access governance and live action control are converging in the product roadmap. The evaluation question is whether a deployed control can intercept the relevant action before it executes, across the actual tools an enterprise uses.</p>
          <p className="blog-source"><a href={sources.sailpoint}>SailPoint Navigate announcement · October 6, 2026 (PDF)</a></p>

          <h3>October 7 · RSA announces Agent ID for regulated environments</h3>
          <p>RSA announced Agent ID at World Summit AI, positioning discovery, agent registration, named ownership, bounded permissions, and policy checks at tool-and-argument depth as part of a lifecycle offering for regulated organizations. Its announcement emphasizes attributable records for governed actions.</p>
          <p><strong>Availability:</strong> RSA gives November 16, 2026 as the planned general availability date for Discover and Secure. Govern is planned for the first half of 2027. This is an announcement in this reporting window, with delivery dates ahead.</p>
          <p><strong>Why it matters:</strong> the language of IAM is expanding from an account’s permissions to the authority behind a consequential action. The next test is how those claims behave across delegation, revocation, and tools that sit outside a vendor’s native environment.</p>
          <p className="blog-source"><a href={sources.rsa}>RSA Agent ID announcement · October 7, 2026</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Four boundaries worth watching</h2>
          <p>These are preprints and controlled studies. They identify useful failure modes; they do not establish universal protection or production readiness.</p>
          <h3>September 27 · Credential custody belongs outside the model</h3>
          <p>A new study of vault-mediated execution evaluates a design where the model selects a connector identifier and a trusted boundary supplies authentication. Its 16 probes met their expected outcomes, while a separate misconfigured connector failed its provider’s authentication contract. The authors explicitly characterize the work as a small functional evaluation, not certification.</p>
          <p><strong>Our interpretation:</strong> secret storage and action authorization solve different problems. A credential can remain hidden while an agent still requests an inappropriate action; both boundaries need enforcement.</p>
          <p className="blog-source"><a href={sources.vault}>Vault-mediated credential study · submitted September 27, 2026</a></p>

          <h3>October 2 · Permission and task relevance are separate signals</h3>
          <p>A task–tool matching paper investigates small language models as per-call relevance classifiers across tasks involving multiple MCP servers. A classifier evaluates whether the selected tool fits the assigned task, supplying a signal for downstream enforcement.</p>
          <p><strong>Our interpretation:</strong> the architectural separation matters more than the model choice. Relevance may inform a decision, but a probabilistic judgment should not silently grant authority or replace a deterministic permission boundary.</p>
          <p className="blog-source"><a href={sources.intent}>Task–tool intent-matching preprint · submitted October 2, 2026</a></p>

          <h3>October 3 · A correct-looking answer can still fail the authority check</h3>
          <p>A study of agentic label harmonization separates label agreement from authority to propose an action, output completeness, and responsiveness to changed evidence. Its tests use two neuroimaging cohorts and rule-derived reference labels. Agreement measures consistency with those rules, not independent correctness.</p>
          <p><strong>Our interpretation:</strong> evaluation should test whether an agent was entitled to act, as well as whether its answer matched a reference. The study’s domain-specific results should not be generalized into an IAM benchmark.</p>
          <p className="blog-source"><a href={sources.labels}>Label Agreement Does Not Measure Authorization · submitted October 3, 2026</a></p>

          <h3>October 6 revision · Protect the rules that decide access</h3>
          <p>The revised “Subjects, Not Authors” paper examines agents that both consume governed data and draft governance artifacts. It finds that changing a field’s classification can alter authorization without changing policy text, so reviewing only the policy diff misses a consequential change. The authors also identify limits in constraints covering only explicitly named fields.</p>
          <p><strong>Our interpretation:</strong> classification, policy publication, and access decisions belong to the same security review boundary. Giving an agent permission to edit metadata may change its effective authority even when its own role stays constant.</p>
          <p className="blog-source"><a href={sources.authorship}>Subjects, Not Authors · v2 revised October 6, 2026; first submitted September 24</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">The longer-term developments vector</h2>
          <p><strong>Earlier context, outside this issue’s window:</strong> CrowdStrike’s September 2 Agentic Identity Provider announcement described distinct agent identities, short-lived access, and attribution to the humans or workloads behind them. Proofpoint’s September 22 post argued for bringing task intent and data-access context into identity decisions. These earlier positions help explain why October’s announcements focus on the execution path. <a href={sources.crowdstrike}>CrowdStrike, September 2</a>; <a href={sources.proofpoint}>Proofpoint, September 22</a>.</p>
          <p><strong>Editorial outlook:</strong> together, the sources suggest five connected developments. This is a direction of travel, not a prediction that one architecture or vendor will win.</p>
          <h3>1. From agent accounts to attributable delegation</h3>
          <p>A durable agent identity needs to connect to an accountable owner and the principal whose authority it uses. As agents delegate, the useful record becomes a chain: who authorized the task, which agent acted, and what limits traveled with the delegation. Registration is necessary context; it does not by itself prove every downstream action was authorized.</p>
          <h3>2. From standing privilege to authority at the moment of action</h3>
          <p>Short-lived access and just-in-time provisioning reduce how long privilege exists. The next layer evaluates the concrete call, its arguments, current evidence, and whether the original grant still holds. A real control must be able to stop the call or prevent a protected result from being released.</p>
          <h3>3. From IAM alone to IAM joined with data and intent</h3>
          <p>Permission checks, task relevance, and data sensitivity answer different questions. Their convergence creates a richer decision surface, but also more policy inputs to protect. A change to classification or an approval record can matter as much as a change to the access policy itself.</p>
          <h3>4. From model advice to an independent execution boundary</h3>
          <p>Models can help classify intent, draft rules, and explain anomalies. Their outputs need a separately governed path to enforcement. The agent should not gain authority merely because it produced a plausible justification, nor should a drafted policy become active without its authorized publication path.</p>
          <h3>5. From activity logs to evidence of authority and outcome</h3>
          <p>The valuable audit trail connects the grant, the decision, the executed action, and the observed result. Over time, buyers will need to distinguish a recorded tool call from proof that a control actually applied, and a successful API response from evidence that the intended task was completed.</p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / Next signals</p><h2 id="watch-title">What to watch next</h2>
          <ul><li><strong>Implementation evidence:</strong> NIST’s DevSecOps demonstration and whether it yields reusable deployment patterns. Its next project webinar is scheduled for October 28, according to the September 29 update.</li><li><strong>Delivery against announcements:</strong> RSA’s November Discover/Secure milestone, its later Govern release, and SailPoint’s staged availability. Track shipped enforcement separately from roadmap language.</li><li><strong>Delegation and revocation:</strong> evidence that permissions stay bounded through agent-to-agent handoffs, and that revoked authority stops downstream actions.</li><li><strong>Control evaluation:</strong> tests for stale approvals, inappropriate but permitted calls, metadata changes, and gaps between detection and interception.</li></ul>
          <p>The question for the next edition is whether these systems can show the authority behind a specific action, enforce its limits before execution, and provide evidence of what happened afterward.</p>
        </section>
        <section aria-labelledby="notes-title"><h2 id="notes-title">Editorial notes</h2><p>This digest is a selected review of primary sources available on October 7, 2026, not an exhaustive market census. Dates follow the originating announcement or paper version; the September 24 paper is included only for its October 6 revision. Vendor claims are attributed, and availability language is preserved. Research summaries are based on the linked abstracts and submission histories.</p><p>Published by AgentAction, which develops agent action controls and execution assurance. The analysis reflects that perspective; it is not independent product testing or an endorsement of the vendors discussed.</p></section>
      </div>
    </article>
  </main>;
}
