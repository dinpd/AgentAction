import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts.find((entry) => entry.slug === "agentic-iam-digest-2026-11-07")!;
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  aims: "https://datatracker.ietf.org/doc/html/draft-ietf-wimse-aims-01",
  mission: "https://datatracker.ietf.org/doc/html/draft-mcguinness-oauth-mission-02",
  guardian: "https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-introduces-ai-kill-switch-ai-safety/",
  fiddler: "https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-acquire-fiddler-deliver-agent-observability-ai-trust",
  zetrix: "https://www.zetrix.com/zetrix-ai-and-china-academy-of-information-and-communications-technology-unveil-know-your-agent-kya-service-to-bring-trust-and-accountability-to-ai-agents/",
  research: "https://arxiv.org/abs/2611.07050v1",
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
        <h1>Make delegation<br />verifiable.</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. New drafts give task authority a clearer shape, CrowdStrike adds gateway containment, and a prototype shows where permission checks can break at a handoff.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>November 8, 2026</time></span><span>4 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>Identity, bounded authority, and evidence along the action path. AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <div className="blog-callout"><p>When one agent hands work to another, the receiver needs to know who sent the request, what was delegated, and which limits still apply. A valid credential for the caller answers only the first question.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / What changed</p><h2 id="new-title">Carry the limits with the work</h2>
          <h3>November 2 · Two drafts give agent authority a clearer shape</h3>
          <p>The IETF WIMSE working group published revision 01 of its AI Identity Management System draft. It treats agents as workloads and describes how workload identity, OAuth delegation, and shared security signals can fit together. The aim is guidance for combining existing and emerging mechanisms, rather than a new protocol.</p>
          <p>A separate individual OAuth draft proposes a durable record called a Mission. It binds a task and its approved authority to the approver’s consent. Tokens issued under that record carry a subset of the approved authority. Revoking the Mission stops new issuance; a service that checks only the token may still honor one already issued until it expires.</p>
          <p>The two documents are works in progress. For teams designing an approval flow, they sharpen a practical question: can the service relate the credential it sees to the actual task someone approved?</p>
          <p className="blog-source"><a href={sources.aims}>AI Identity Management System · working-group draft 01</a><br /><a href={sources.mission}>Mission-Bound Authorization for OAuth 2.0 · individual draft 02</a></p>

          <h3>November 3 · CrowdStrike makes its agent kill switch available at the gateway</h3>
          <p>CrowdStrike announced that its Falcon Guardian kill switch was available, with termination first at the gateway and endpoint termination still to come. The company describes an authorized administrator triggering a logged response, with controls to cut enterprise network access and block relaunch on targeted hosts.</p>
          <p>Separately, CrowdStrike signed a definitive agreement to acquire Fiddler AI. Its plan is to add agent evaluation and traceability through Falcon Observe, with general availability planned for the fourth quarter of its fiscal 2027. The acquisition announcement describes a proposed transaction subject to closing conditions and a future integration.</p>
          <p>Stopping new calls and verifying what happened before the stop are separate jobs. A response exercise should cover both, including requests that had already reached another service.</p>
          <p className="blog-source"><a href={sources.guardian}>CrowdStrike kill switch announcement · November 3, 2026</a><br /><a href={sources.fiddler}>CrowdStrike–Fiddler acquisition agreement · November 3, 2026</a></p>

          <h3>November 5 · Zetrix AI announces a cross-border agent identity pilot</h3>
          <p>Zetrix AI and the China Academy of Information and Communications Technology announced a Know Your Agent service based on verifiable credentials. Its design links an agent to a person or organization and lets a receiving service check delegated permissions. The proposed pilot would test whether those credentials and permissions can be recognized across jurisdictions while keeping trust decisions local. Participants are still subject to confirmation.</p>
          <p>The useful evidence will be how a receiving service enforces a limit or learns that a credential was withdrawn. The announcement describes a pilot plan, so those results are still ahead.</p>
          <p className="blog-source"><a href={sources.zetrix}>Zetrix AI: Know Your Agent service and pilot plan · November 5, 2026</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Valid evidence can still describe an overbroad grant</h2>
          <p>Gabriele Donno, Kashif Mehmood, and Katina Kralevska tested a prototype Agent2Agent workflow using a synthetic healthcare reimbursement case. The prototype separately authenticates each request and checks the evidence of authority inherited from earlier steps. It rejected 14 of 15 adversarial conditions in the study. The remaining test exposed a missing check that the delegated permissions stayed within their original bounds.</p>
          <p>In a separate experiment, an intermediary with the shared key for authorization evidence could change the represented authority and produce evidence that still passed verification. That result concerns the prototype’s trust model. It does not show a general vulnerability in Agent2Agent deployments.</p>
          <p>The preprint uses a fixed-depth local setup. Its strongest takeaway is about what to verify: authenticating the current caller is only one check. The receiver also needs evidence of who granted the authority and whether any restriction was widened along the way.</p>
          <p className="blog-source"><a href={sources.research}>Authorization Propagation in Agent2Agent Systems · preprint v1, submitted November 4, 2026</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">Where this is heading</h2>
          <p>Our reading is that delegation will become easier to assess when services can check the same three things at every handoff: the immediate caller, the grant it relies on, and the effect it is requesting. A grant that says “pay this supplier up to $500” has to survive translation into the target service’s account, recipient, amount, and currency fields.</p>
          <p>The next test is withdrawal. Disable new credential issuance, try a credential that was already issued, and check what happened to a request the service had accepted just before the stop. Those are three different outcomes, and each needs its own evidence.</p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / What to watch</p><h2 id="watch-title">Questions for a delegation test</h2>
          <ul>
            <li><strong>Approval:</strong> can a receiving service tie a request back to the task and limits someone reviewed?</li>
            <li><strong>Handoffs:</strong> can an intermediary change the recipient, amount, or other restriction and still pass verification?</li>
            <li><strong>Containment:</strong> which calls stop at the gateway, and which can still reach a service by another path?</li>
            <li><strong>Outcome:</strong> can the affected service confirm whether an operation completed before a stop or retry?</li>
          </ul>
        </section>
        <div><p className="blog-source">Published by AgentAction, which develops controls for agent actions.</p><p><a href="/blog/agentic-iam-digest-2026-10-31">Previous issue: October 25–31</a> · <a href="/blog">All digests</a></p></div>
      </div>
    </article>
  </main>;
}
