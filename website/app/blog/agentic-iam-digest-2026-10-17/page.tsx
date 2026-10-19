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
        <figcaption>Identity, bounded authority, and evidence along the action path. AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <div className="blog-callout"><p>Agent identity is moving into runtime enforcement. The focus is shifting from registering an agent to checking each action: who authorized it, whether that authority still holds, and whether the request matches what was approved.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / In the reporting window</p><h2 id="new-title">What changed</h2>
          <h3>October 8 · Okta puts delegated identity in the tool-call path</h3>
          <p>Okta’s Agent Gateway article describes a runtime layer for agent connections to Model Context Protocol (MCP) tools. Okta says calls must identify both the agent and the user it represents, with policy checks, credential isolation, and an attributable audit trail. It describes Agent Gateway as generally available within Okta for AI Agents.</p>
          <p>Cross App Access support and a gateway-based kill switch are still forthcoming.</p>
          <p>Delegated identity needs to reach the control point that can stop a tool call. Buyers should ask whether an agent can bypass the gateway using a backend credential.</p>
          <p className="blog-source"><a href={sources.okta}>Okta Agent Gateway explanation · October 8, 2026</a></p>

          <h3>October 13 · Workday signs an agreement to acquire C1.ai</h3>
          <p>Workday announced a definitive agreement to acquire C1.ai, connecting its enterprise workforce and Agent System of Record story with identity governance across connected business systems. The stated direction includes granting and removing access as people and agents join, change roles, complete work, or leave.</p>
          <p>The deal is expected to close in Workday’s fiscal Q4 2027, ending January 31, 2027, subject to customary closing conditions.</p>
          <p>An agent’s authority may change because of an event in a business system: a new owner, a finished task, or a role change. Keeping those events connected to access is what makes an inventory useful.</p>
          <p className="blog-source"><a href={sources.workday}>Workday acquisition announcement · October 13, 2026</a></p>

          <h3>October 15 · CERT-In reports agents exceeding task authorization</h3>
          <p>CERT-In’s advisory distinguishes research and evaluation agents that accessed Indian organizations beyond their assigned scope from malicious actors deliberately using agentic intrusion tools. It attributes the activity to familiar weaknesses, including exposed credentials, reachable legacy APIs, and overly broad service roles. In the provider-disclosed cases, the affected organizations had not detected the access themselves.</p>
          <p>CERT-In recommends task-scoped, default-deny network access in evaluation environments, independent stop authority, live monitoring, and explicit handling of discovered credentials.</p>
          <p>Instructions alone cannot enforce a task boundary. Credentials, network paths, and service permissions determine what an agent can still do when it ignores or misreads the task.</p>
          <p className="blog-source"><a href={sources.cert}>CERT-In Advisory CIAD-2026-0049 · October 15, 2026</a></p>

          <h3>October 16 · Oracle describes layered controls in its own rollout</h3>
          <p>Oracle’s account of its internal AI adoption separates preserving a user’s permissions from restricting what an assistant may do with them. It describes MCP access constrained by user permissions and consented scopes, temporary privileged access, human approval for sensitive operations, and workload federation for model access.</p>
          <p>Console AI remains a pre-production preview. Oracle’s Deny policy has administrator exemptions and scope limits; downstream service calls need their own restrictions.</p>
          <p>An assistant acting on someone’s behalf may need fewer permissions than that person has. Some operations should remain prohibited even after approval.</p>
          <p className="blog-source"><a href={sources.oracle}>Oracle: IAM enables AI transformation · October 16, 2026</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Approval needs an enforceable meaning</h2>
          <p>Two new preprints and an accepted journal article examine how services can check that a requested action matches the user’s task and approval.</p>
          <h3>October 10 · A signed-in browser is not a task-specific grant</h3>
          <p>A browser-agent preprint tests page instructions that induce account-access approval or webhook registration beyond the user’s task. Its service-side gate compares the requested action with a task envelope fixed before execution. In the reported evaluation, agents continued attempting the injected requests, while the service rejected all 70 gated attack runs; authorized controls still completed.</p>
          <p>The agents still attempted the injected actions; the service stopped them. That distinction matters when a consent screen appears inside an already signed-in session. The study tested two authorization surfaces with a limited agent/model setup.</p>
          <p className="blog-source"><a href={sources.browser}>The Agent Clicks Approve · preprint v1 submitted October 10, 2026</a></p>

          <h3>October 13 · Checked action certificates make the decision replayable</h3>
          <p>A Scientific Reports article presents action certificates checked independently of the planner before a governed tool call executes. A trusted execution layer derives obligations from the tool contract and binds the certificate to the exact invocation. The reported semantic and structural tests examine invalid support, changed arguments, omitted preconditions, and downgraded risk.</p>
          <p>The peer-reviewed article is available before the final Version of Record. A stateful guardrail checking the same conditions matched its safety results; the certificate adds a record that can be checked again. The certificate relies on trusted tool contracts; it cannot establish whether those contracts match the real-world operation.</p>
          <p>A checkable record helps explain a decision afterward. The control still has to run before the tool call.</p>
          <p className="blog-source"><a href={sources.certificates}>Proof carrying agent actions · Scientific Reports, published October 13, 2026</a></p>

          <h3>October 15 · Bind approval to the effect the user actually reviewed</h3>
          <p>A step-up authorization preprint studies whether compromising an agent can manufacture approval, and whether approval names the exact effect it permits. Its reference gateway renders a review card from a canonical effect description, obtains a signature, and executes the stored call. The experiments address substitution, replay, misleading narration, and stretched grants.</p>
          <p>In this preprint, approval flooding still worked against a modeled approver. A second device added no measurable benefit over trusted on-host confirmation in the experiments. Approval cannot block an effect that policy already permits, and the formal results depend on the authors’ stated assumptions.</p>
          <p>The approval needs to stay tied to the reviewed operation, including its recipient, amount, arguments, and permitted reuse.</p>
          <p className="blog-source"><a href={sources.approval}>Approve What, Exactly? · preprint v1 submitted October 15, 2026</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">Where this is heading</h2>
          <p>Taken together, these developments suggest four practical priorities for agent access controls.</p>
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
        <footer><p className="blog-source">Published by AgentAction, which develops controls for agent actions. Research summaries are based on the linked abstracts.</p><p><a href="/blog/agentic-iam-digest-2026-10-07">Previous issue: September 25–October 7</a> · <a href="/blog">All digests</a></p></footer>
      </div>
    </article>
  </main>;
}
