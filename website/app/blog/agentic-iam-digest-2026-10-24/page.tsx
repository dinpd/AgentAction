import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts.find((entry) => entry.slug === "agentic-iam-digest-2026-10-24")!;
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  "microsoft": "https://www.microsoft.com/en-us/security/blog/2026/10/19/agents-are-your-newest-insiders-security-must-move-at-their-speed/",
  "beyondtrust": "https://www.beyondtrust.com/press/ai-agent-security-general-availability",
  "sentinelone": "https://investors.sentinelone.com/press-releases/news-details/2026/SentinelOne-Launches-Singularity-Agentic-Detection-and-Response-to-Stop-Rogue-and-Malicious-AI-Agents-at-Machine-Speed/default.aspx",
  "w3c": "https://github.com/w3c-cg/ai-agent-protocol/blob/main/meetings/2026-10-21.md",
  "benchmark": "https://arxiv.org/abs/2610.27548v2"
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
        <h1>Knowing the agent<br />is only the start.</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. Enterprise security vendors bring agent activity into runtime policy and response, while standards work and new research sharpen the distinction between identity, permission, and a completed task.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>October 26, 2026</time></span><span>6 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>Identity, bounded authority, and evidence along the action path. AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <div className="blog-callout"><p>An agent inventory becomes useful when it helps control the next action. This week’s announcements put more emphasis on distinguishing agent activity from human activity, changing permissions during a task, and intervening when an authorized agent goes off course.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / What changed</p><h2 id="new-title">From finding agents to controlling actions</h2>
          <h3>October 19 · Microsoft outlines access that changes with agent risk</h3>
          <p>Microsoft describes an expansion of Project Perception around agent containment. Its announcement introduces Dynamic Permissions, Dynamic Agent Risk, and Dynamic Conditional Access: task-scoped authority, risk signals gathered during execution, and coordinated changes to what the agent may do.</p>
          <p>The response need not be an immediate shutdown. Microsoft describes preserving reads while removing writes, narrowing resource access, requiring verified approval, or isolating execution as risk rises. It also announces broader local-agent discovery and additional Entra Agent ID identity patterns.</p>
          <p>This is a product-direction announcement; the post does not establish general availability for every new component. For buyers, the practical test is whether a changed risk decision reaches every relevant tool and credential path before another consequential action executes.</p>
          <p className="blog-source"><a href={sources.microsoft}>Microsoft Security: agents as insiders · October 19, 2026</a></p>

          <h3>October 21 · BeyondTrust makes endpoint agent controls generally available</h3>
          <p>BeyondTrust announced general availability of AI Agent Security on its Pathfinder Platform for Windows and macOS endpoints. The company says it distinguishes human from agent activity, evaluates individual agent actions against policy, and can invoke just-in-time access or human approval when more privilege is needed.</p>
          <p>Its accompanying telemetry analysis records approximately 1.28 million shell-command requests from 132,000 prompts over four weeks. Those are requested commands, not necessarily successful executions, and the findings come from early customer samples.</p>
          <p>The useful distinction is between the access an employee needs and the access an agent may exercise on that employee’s behalf. Endpoint enforcement gives that distinction a place to operate; teams still need to check coverage for remote services and credentials outside the managed device.</p>
          <p className="blog-source"><a href={sources.beyondtrust}>BeyondTrust availability announcement and methodology · October 21, 2026</a></p>

          <h3>October 21 · SentinelOne introduces agent detection and response in early access</h3>
          <p>SentinelOne unveiled Singularity Agentic Detection and Response, available immediately in early access. Its stated scope combines agent and MCP inventory, execution governance, behavioral detection, and containment. The company describes tracing a user request through the assistant and tool to the process or file that follows.</p>
          <p>SentinelOne also says security teams can stop one agent mid-action while the rest of a workflow continues. These are early-access product claims, rather than independent evidence that every listed attack is prevented.</p>
          <p>For an evaluation, trace one consequential operation from request to enforcement and observed result. Then check what happens to retries and already-dispatched work when the agent is stopped.</p>
          <p className="blog-source"><a href={sources.sentinelone}>SentinelOne Singularity ADR announcement · October 21, 2026</a></p>

          <h3>October 21 · A standards discussion keeps identity separate from permission</h3>
          <p>The W3C AI Agent Protocol Community Group discussed an Agent Authorization proposal that separates an agent’s identifier and key control, signed claims about its role or mandate, and resource-side permission through OAuth.</p>
          <p>The distinction matters across organizations: a verified identity or signed mandate supplies evidence for a decision; the receiving service still applies its own access policy. The meeting recorded no choice between the proposed client-onboarding approaches or adoption decision. This is community-group design work, not a W3C Recommendation.</p>
          <p className="blog-source"><a href={sources.w3c}>AI Agent Protocol Community Group meeting notes · October 21, 2026</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Finishing the task does not settle permission</h2>
          <h3>October 20–21 · AuthorizationBench tests actions beyond delegated scope</h3>
          <p>A new preprint introduces AuthorizationBench: 286 executable tasks across ten application domains, evaluated with four models, two reasoning settings, and three agent harnesses. The authors report actions outside authorization in 19.2% of 6,864 trajectories. More reasoning left the aggregate rate nearly unchanged.</p>
          <p>The benchmark deliberately keeps authorized and unauthorized paths executable so it can observe which one an agent takes. Its rates describe those experimental configurations, not the frequency of violations in enterprise deployments. The paper was submitted October 20 and revised October 21; the linked version is v2.</p>
          <p>Agents that consulted the principal had lower observed violation rates, but the reported association does not establish that adding an approval prompt causes the improvement. The broader lesson for evaluation is to score task completion and authorization separately, including apparently helpful actions that the user never delegated.</p>
          <p className="blog-source"><a href={sources.benchmark}>Act on Your Behalf, Beyond Your Authorization · preprint v2, October 21, 2026</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">Where this is heading</h2>
          <p>Our reading of the week is that agent security is becoming a coordination problem: identity, endpoint policy, application access, and incident response need to agree on what remains permitted as work proceeds.</p>
          <h3>1. Make a permission change effective</h3>
          <p>Revoking a grant should have a defined effect on open sessions, issued credentials, queued operations, and delegated work. An administrator needs to know which actions stopped, which remained possible, and which had already completed. That is a more useful result than a dashboard saying an agent was disabled.</p>
          <h3>2. Keep attribution and authorization distinct</h3>
          <p>A trustworthy record of who acted helps establish accountability. Permission still depends on the operation, purpose, resource, and current constraints. A service receiving a delegated request needs enough context to make that decision without treating a recognizable agent as an unrestricted caller.</p>
          <h3>3. Measure the boundary, including useful work</h3>
          <p>A control should stop an unauthorized operation and allow legitimate work to continue. Test both sides: allowed actions, rejected actions, false rejections, and evidence from the affected system. A successful business result and a correctly enforced permission boundary answer different questions.</p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / What to watch</p><h2 id="watch-title">Questions worth taking into an evaluation</h2>
          <ul>
            <li><strong>Availability:</strong> ask which controls are deployable today, which require early access, and which are announced direction.</li>
            <li><strong>Coverage:</strong> include alternate credentials, remote tools, child agents, and work already in flight.</li>
            <li><strong>Approval:</strong> check that the operation executed matches the operation a person reviewed.</li>
            <li><strong>Evidence:</strong> distinguish requested commands, executed operations, and independently observed outcomes.</li>
          </ul>
        </section>
        <div><p className="blog-source">Published by AgentAction, which develops controls for agent actions. Research coverage is based on the linked abstract.</p><p><a href="/blog/agentic-iam-digest-2026-10-17">Previous issue: October 7–17</a> · <a href="/blog">All digests</a></p></div>
      </div>
    </article>
  </main>;
}
