import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts.find((entry) => entry.slug === "agentic-iam-digest-2026-10-31")!;
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  nist: "https://www.nist.gov/blogs/cybersecurity-insights/design-tenets-agent-identity-management-systems",
  ibmIdentity: "https://www.ibm.com/new/announcements/ibm-agent-identity-is-now-generally-available-building-trust-for-the-agentic-era",
  ibm: "https://newsroom.ibm.com/2026-10-27-ibm-introduces-identity-and-control-for-ai-agents,-securing-frontier-intelligence-for-the-enterprise",
  oauth: "https://datatracker.ietf.org/doc/html/draft-chen-oauth-agent-authz-use-cases-05",
  research: "https://arxiv.org/abs/2610.36544v1",
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
        <p className="eyebrow">Agentic IAM digest / Issue {post.issue}</p>
        <h1>Keep authority<br />outside the agent.</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. NIST sets out design principles for independent controls, IBM brings agent identity and credential capabilities into general availability, and researchers examine whether an intervention improves the outcome.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>November 1, 2026</time></span><span>5 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>Identity, bounded authority, and evidence along the action path. AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <div className="blog-callout"><p>An agent can propose an action, but the systems deciding whether it may proceed need their own authority. This week’s developments make that separation more concrete: distinct identities, credentials issued for a defined task, policy outside the reasoning loop, and evidence that an intervention achieved its purpose.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / What changed</p><h2 id="new-title">Give the controls a boundary of their own</h2>
          <h3>October 27 · NIST proposes ten design tenets for agent IAM</h3>
          <p>NIST’s new design tenets call for agent identities distinct from human accounts, cryptographically linked delegation with narrowing permissions, short-lived and revocable authorization, and evidence held independently of the agent. They also separate policy enforcement from model reasoning and put deterministic mechanisms at the center of access decisions.</p>
          <p>Human review has a defined role: organizations should set escalation thresholds and provide enough context for a decision, while accounting for approval fatigue. A model’s risk assessment can inform an access decision without becoming the authority that grants it.</p>
          <p>These are proposed design principles in a NIST blog, intended to guide NCCoE demonstrations and organizational roadmaps. They are not a new mandatory standard or a completed interoperability demonstration. NIST acknowledges that current technology and standards do not yet fulfill every tenet.</p>
          <p>For an architecture review, the useful question is concrete: can the agent change the permissions, credentials, or evidence that constrain its next action?</p>
          <p className="blog-source"><a href={sources.nist}>NIST: Design Tenets for Agent Identity Management Systems · October 27, 2026</a></p>

          <h3>October 26–27 · IBM connects agent identity with credential control</h3>
          <p>IBM’s October 26 announcement makes Agent Identity generally available. The company describes an inventory with ownership and lifecycle state, on-behalf-of delegation, task-scoped tokens, contextual authorization, and audit trails connecting people, agents, credentials, and downstream actions. IBM Verify provides identity and governance controls; HashiCorp Vault brokers target-specific credentials for systems that cannot consume delegated tokens directly.</p>
          <p>At TechXchange on October 27, IBM also lists Vault 2.2 as generally available. It describes agent-specific accounts, credential renewal, and access denial or session revocation when an agent exceeds approved permissions. Those are vendor capability claims; an evaluation still needs to establish which connected systems enforce the intended boundary.</p>
          <p>Availability differs across the portfolio. Orchestrate’s evaluation capabilities are generally available, while its discovery and containment capabilities are in tech preview. Secure Hub is in public preview. The broad announcement should not be read as general availability of every control.</p>
          <p>For buyers, follow one task from delegated identity to the credential accepted by the target service. Then withdraw permission and check what the service actually refuses.</p>
          <p className="blog-source"><a href={sources.ibmIdentity}>IBM Agent Identity availability · October 26, 2026</a><br /><a href={sources.ibm}>IBM TechXchange announcement and availability breakdown · October 27, 2026</a></p>

          <h3>October 27 · An OAuth draft examines the gaps between grants and actions</h3>
          <p>Revision 05 of <em>Agent Authorization use cases and gap analysis</em> examines authorization context, delegation chains, and withdrawal of authority across agent workflows. Its cross-organization discussion distinguishes actor history from proof of the restrictions granted at each delegation step.</p>
          <p>The draft recognizes existing building blocks, including Rich Authorization Requests, Token Exchange, revocation, and introspection. It identifies remaining questions about relating later approvals to an original task and propagating withdrawal across dependent grants and authorization servers. That is more specific than saying OAuth cannot support agent delegation.</p>
          <p>This is an individual Internet-Draft, not an adopted IETF standard or an endorsed protocol. Its value for implementers is a set of interoperability questions: what authority was derived, which restrictions survived, and how does a downstream service learn that permission ended?</p>
          <p className="blog-source"><a href={sources.oauth}>Agent Authorization use cases and gap analysis · individual draft 05, dated October 27, 2026</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">A good alarm does not guarantee a useful intervention</h2>
          <h3>October 27 · Restart monitors need evidence about recovery</h3>
          <p>A preprint by Siddharth Jain and Venkat N. Vedam asks whether a failure prediction justifies restarting an agent. Their mathematical example holds monitor accuracy at 90% yet moves the effect on task success from a five-point loss to a 35-point gain by changing the replacement attempt’s chance of finishing within the remaining budget. That range is analytical, not a measured improvement from a deployed monitor.</p>
          <p>The study covers 194 model executions on 19 selected SymPy issues from SWE-bench Verified. An apparent restart gain did not replicate on new task groups tested afterward. A later audit found insufficient statistical support to recommend either action in 103 live comparisons under its chosen rule; that does not establish that continuing was always preferable.</p>
          <p>The experiments are limited to selected tasks from one repository, with later interventions using one model and one compact harness. The result supports evaluating the recovery action and its costs alongside detection quality, rather than treating an accurate warning as sufficient evidence for automatic restart.</p>
          <p className="blog-source"><a href={sources.research}>Monitor Accuracy Isn’t the Answer · preprint v1, submitted October 27, 2026</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">Where this is heading</h2>
          <p>Our reading is that the next useful comparison between agent-control systems will concern who can change a decision, where it takes effect, and what evidence survives afterward. An inventory or a policy statement alone leaves those questions unanswered.</p>
          <h3>1. Separate the ability to request from the ability to authorize</h3>
          <p>The same agent may need broad knowledge of a workflow and narrow authority to alter it. Keep its proposed action, the approval decision, and the credential issued for execution connected, with a clear owner for each. Test whether changes to the request invalidate the earlier approval.</p>
          <h3>2. Test withdrawal at the receiving service</h3>
          <p>A central revoke button is useful only when its effect is understood downstream. Include exchanged credentials, delegated work, retries, and calls already dispatched. Record the delay before new operations are refused and distinguish that from the handling of work already in progress.</p>
          <h3>3. Judge recovery by the resulting work</h3>
          <p>Pausing, restarting, resetting context, and escalating to a person are different interventions. Give each a defined purpose, authority boundary, and outcome check. A cleaner error label is useful operationally; it does not by itself show that the business task recovered.</p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / What to watch</p><h2 id="watch-title">Questions for the next deployment review</h2>
          <ul>
            <li><strong>Control ownership:</strong> can the agent edit the policy, credential path, or log used to judge its own actions?</li>
            <li><strong>Delegation:</strong> can the receiving service establish the restrictions behind a request, including later approvals and withdrawals?</li>
            <li><strong>Availability:</strong> which controls are generally available, and which require a preview deployment?</li>
            <li><strong>Recovery evidence:</strong> does an intervention improve verified outcomes within its time and cost budget?</li>
          </ul>
        </section>
        <div><p className="blog-source">Published by AgentAction, which develops controls for agent actions.</p><p><a href="/blog/agentic-iam-digest-2026-10-24">Previous issue: October 18–24</a> · <a href="/blog">All digests</a></p></div>
      </div>
    </article>
  </main>;
}
