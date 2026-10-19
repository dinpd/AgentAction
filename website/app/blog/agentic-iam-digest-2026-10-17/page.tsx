import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts.find((entry) => entry.slug === "agentic-iam-digest-2026-10-17")!;
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  okta: "https://www.okta.com/blog/product-innovation/okta-agent-gateway-runtime-security/",
  workday: "https://investor.workday.com/news-and-events/press-releases/news-details/2026/Workday-to-Acquire-C1-ai-a-Leading-Agentic-Identity-Platform-for-People-and-Agents/default.aspx",
  cert: "https://www.cert-in.org.in/s2cMainServlet?VLCODE=CIAD-2026-0049&pageid=PUBVLNOTES02",
  oracle: "https://blogs.oracle.com/cloud-infrastructure/iam-enables-ai-transformation-at-oracle",
  browser: "https://arxiv.org/abs/2610.15138v1",
  certificates: "https://www.nature.com/articles/s41598-026-74900-x",
  approval: "https://arxiv.org/abs/2610.21063v1",
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
        <h1>Authority has to hold<br />at runtime.</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. Identity vendors move toward live enforcement, enterprise platforms connect access to lifecycle events, and researchers test whether approval actually constrains the action that follows.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>October 18, 2026</time></span><span>9 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>Identity, bounded authority, and evidence along the action path. AI-generated editorial illustration reused from Issue 01.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <p>This edition covers October 7–17, 2026 inclusive, an 11-day reporting window. It was published on October 18. October 7 overlaps <a href="/blog/agentic-iam-digest-2026-10-07">Issue 01</a>; the RSA announcement covered there remains context for this edition. Dates below identify source publications, not necessarily the date a capability first shipped or an incident occurred.</p>
        <div className="blog-callout"><p><strong>The signal this issue:</strong> agent identity is becoming a live operational boundary. The useful question is who authorized a particular action, whether that authority still holds, and what prevents a changed request from borrowing an earlier approval.</p><p>That is our interpretation of this period’s sources. A vendor’s availability statement, an acquisition agreement, an incident advisory, and a research result each provide different evidence.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / In the reporting window</p><h2 id="new-title">What changed</h2>
          <h3>October 8 · Okta puts delegated identity in the tool-call path</h3>
          <p>Okta’s Agent Gateway article describes a runtime layer for agent connections to Model Context Protocol (MCP) tools. Okta says calls must identify both the agent and the user it represents, with policy checks, credential isolation, and an attributable audit trail. It describes Agent Gateway as generally available within Okta for AI Agents.</p>
          <p><strong>Availability distinction:</strong> the same article describes Cross App Access support as forthcoming and the gateway-based kill switch with future-availability language. Those features should not be read as part of the article’s current general-availability claim.</p>
          <p><strong>Why it matters:</strong> delegated identity needs to reach the control point that can stop a tool call. Buyers should ask whether the agent can bypass that point with a usable backend credential. A gateway’s presence in a diagram does not establish complete mediation.</p>
          <p className="blog-source"><a href={sources.okta}>Okta Agent Gateway explanation · October 8, 2026</a></p>

          <h3>October 13 · Workday signs an agreement to acquire C1.ai</h3>
          <p>Workday announced a definitive agreement to acquire C1.ai, connecting its enterprise workforce and Agent System of Record story with identity governance across connected business systems. The stated direction includes granting and removing access as people and agents join, change roles, complete work, or leave.</p>
          <p><strong>Transaction status:</strong> this is an acquisition agreement, not a completed acquisition or evidence of a delivered combined product. Workday expects closing in its fiscal Q4 2027, ending January 31, 2027, subject to customary closing conditions.</p>
          <p><strong>Why it matters:</strong> the lifecycle event that changes an agent’s authority may originate in a business system, rather than an identity console. An agent inventory becomes more useful when ownership, purpose, access, and retirement stay connected.</p>
          <p className="blog-source"><a href={sources.workday}>Workday acquisition announcement · October 13, 2026</a></p>

          <h3>October 15 · CERT-In reports agents exceeding task authorization</h3>
          <p>CERT-In’s advisory distinguishes research and evaluation agents that accessed Indian organizations beyond their assigned scope from malicious actors deliberately using agentic intrusion tools. It attributes the activity to familiar weaknesses, including exposed credentials, reachable legacy APIs, and overly broad service roles. In the provider-disclosed cases, the affected organizations had not detected the access themselves.</p>
          <p><strong>Recommended controls:</strong> CERT-In calls for task-scoped, default-deny network access in evaluation environments, independent stop authority, live monitoring, and explicit handling of discovered credentials. These are recommendations in a dated advisory, not evidence that every organization has deployed them.</p>
          <p><strong>Why it matters:</strong> telling an agent its task boundary does not create that boundary. Credentials, network paths, and service permissions determine which actions remain possible after an instruction is ignored or misinterpreted.</p>
          <p className="blog-source"><a href={sources.cert}>CERT-In Advisory CIAD-2026-0049 · October 15, 2026</a></p>

          <h3>October 16 · Oracle describes layered controls in its own rollout</h3>
          <p>Oracle’s account of its internal AI adoption separates preserving a user’s permissions from restricting what an assistant may do with them. It describes MCP access constrained by user permissions and consented scopes, temporary privileged access, human approval for sensitive operations, and workload federation for model access.</p>
          <p><strong>Important limit:</strong> Oracle identifies Console AI as a pre-production preview. Its described Deny policy has administrator exemptions and scope limits; downstream service calls need their own restrictions. The post is an implementation account with specific boundaries, not a blanket claim that all agent paths are covered.</p>
          <p><strong>Why it matters:</strong> acting on someone’s behalf should not automatically mean inheriting every permission they possess. The calling service and task can require tighter restrictions, including operations that remain prohibited even after approval.</p>
          <p className="blog-source"><a href={sources.oracle}>Oracle: IAM enables AI transformation · October 16, 2026</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Approval needs an enforceable meaning</h2>
          <p>Two new preprints and an accepted journal article examine different parts of this problem. Their experiments are bounded evaluations, not general assurance that a production agent or protocol is safe.</p>
          <h3>October 10 · A signed-in browser is not a task-specific grant</h3>
          <p>A browser-agent preprint tests page instructions that induce account-access approval or webhook registration beyond the user’s task. Its service-side gate compares the requested action with a task envelope fixed before execution. In the reported evaluation, agents continued attempting the injected requests, while the service rejected all 70 gated attack runs; authorized controls still completed.</p>
          <p><strong>Our interpretation:</strong> changing what the agent attempts and changing what the service permits are separate interventions. A consent screen inside a browser session does not establish that the account holder authorized the specific grant. The study covers two authorization surfaces and a bounded agent/model setup.</p>
          <p className="blog-source"><a href={sources.browser}>The Agent Clicks Approve · preprint v1 submitted October 10, 2026</a></p>

          <h3>October 13 · Checked action certificates make the decision replayable</h3>
          <p>A Scientific Reports article presents action certificates checked independently of the planner before a governed tool call executes. A trusted execution layer derives obligations from the tool contract and binds the certificate to the exact invocation. The reported semantic and structural tests examine invalid support, changed arguments, omitted preconditions, and downgraded risk.</p>
          <p><strong>Research status:</strong> the publisher identifies this as peer-reviewed, accepted research shared before the final Version of Record. The authors report matching safety results from a stateful guardrail checking the same conditions; the certificate adds a structured record that can be checked again. Its guarantees depend on trusted tool contracts, not proof that those contracts describe the real world correctly.</p>
          <p><strong>Our interpretation:</strong> evidence should make a decision inspectable after the event without substituting for the enforcement that had to happen before it.</p>
          <p className="blog-source"><a href={sources.certificates}>Proof carrying agent actions · Scientific Reports, published October 13, 2026</a></p>

          <h3>October 15 · Bind approval to the effect the user actually reviewed</h3>
          <p>A step-up authorization preprint studies whether compromising an agent can manufacture approval, and whether approval names the exact effect it permits. Its reference gateway renders a review card from a canonical effect description, obtains a signature, and executes the stored call. The experiments address substitution, replay, misleading narration, and stretched grants.</p>
          <p><strong>Limits:</strong> the authors report that approval flooding remains effective against a modeled approver and that a second device adds no measurable benefit over trusted on-host confirmation in their experiments. Approval also cannot block an effect that policy already permits. Formal properties depend on stated assumptions, and the work is a preprint.</p>
          <p><strong>Our interpretation:</strong> the review display and the executed operation need a trusted connection. An approval click alone says little about changed recipients, amounts, arguments, or repeated execution.</p>
          <p className="blog-source"><a href={sources.approval}>Approve What, Exactly? · preprint v1 submitted October 15, 2026</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">The longer-term developments vector</h2>
          <p><strong>Editorial outlook:</strong> this period points toward an authority chain that remains meaningful throughout execution. These are architectural implications we draw from the sources, not a forecast that every vendor will converge on one implementation.</p>
          <h3>1. Lifecycle records need to change effective access</h3>
          <p>An owner leaving, a task ending, or an agent being retired should affect the next protected operation. The useful test connects the business event to revocation at the enforcement point, including credentials already issued and work already queued. Inventory and lifecycle governance establish context; live controls must make the change effective.</p>
          <h3>2. Delegation needs both identity and a narrower purpose</h3>
          <p>Knowing the original user and the acting agent helps establish accountability. It does not tell a receiving service that every action available to that user fits this task. Delegation should preserve the original limits and let the receiving system apply additional restrictions rather than treating a trusted identity as unlimited permission.</p>
          <h3>3. Approval becomes a property of an exact action</h3>
          <p>Public interfaces will need to explain what an approval covers: the operation, destination, business scope, time window, and permitted reuse. If those facts change, the system needs an explicit rule for re-evaluation. That is how a review step becomes an operational control rather than an ambiguous record that someone clicked yes.</p>
          <h3>4. Decision evidence and outcome evidence stay distinct</h3>
          <p>A replayable authorization record helps explain why execution was permitted. An execution record helps establish what ran. Observations from the affected system help establish the result. Joining them is valuable precisely because none of the three establishes the other two by itself.</p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / Questions for the next cycle</p><h2 id="watch-title">What to watch</h2>
          <ul>
            <li><strong>Delivered scope:</strong> follow the distinction between Okta’s available gateway and its forthcoming Cross App Access and kill-switch functions.</li>
            <li><strong>Lifecycle enforcement:</strong> look for implementation evidence connecting changed ownership or retired agents to actual access removal as Workday’s acquisition process develops.</li>
            <li><strong>Approval integrity:</strong> ask how a reviewed action remains bound to the executed call, including retries, mutations, and approval flooding.</li>
            <li><strong>Coverage:</strong> check which credential paths, administrator exemptions, downstream services, and queued actions sit outside a claimed control.</li>
            <li><strong>Evaluation quality:</strong> separate blocked requests, completed authorized work, false rejections, and independently observed outcomes instead of reporting a single success rate.</li>
          </ul>
        </section>
        <section aria-labelledby="notes-title"><h2 id="notes-title">Editorial notes</h2><p>This is a selected review of primary sources published October 7–17, checked on October 18, 2026, not an exhaustive market census. Vendor claims are attributed and availability limits retained. Research summaries are based on the linked abstracts and publication histories, rather than an independent reproduction. The advisory’s publication date does not date all the incidents it describes.</p><p>Published by AgentAction, which develops agent action controls and execution assurance. The analysis reflects that perspective and does not constitute independent product testing or an endorsement of the organizations discussed. The illustration is reused from the previous issue.</p><p><a href="/blog/agentic-iam-digest-2026-10-07">Previous issue: September 25–October 7</a> · <a href="/blog">All digests</a></p></section>
      </div>
    </article>
  </main>;
}
