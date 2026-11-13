import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts.find((entry) => entry.slug === "agentic-iam-digest-2026-11-12")!;
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  workspace: "https://developers.google.com/workspace/release-notes#October_12_2026",
  aws: "https://aws.amazon.com/blogs/architecture/inside-an-enterprise-ai-agent-a-governed-observable-loop-architecture/",
  deputyBench: "https://arxiv.org/abs/2611.13355v1",
  reaBench: "https://arxiv.org/abs/2611.16493v1",
  ietf: "https://mailarchive.ietf.org/arch/msg/audit/TXpgXDJF4y6geQ4nM4Xa_SrD6rs/",
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
        <h1>When can an agent<br />go ahead?</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. Google Workspace starts enforcing a separate OAuth designation for agents. AWS and two research teams look at what systems need to check before and after a tool call.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>November 13, 2026</time></span><span>3 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>An action waits at an approval checkpoint. AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <div className="blog-callout"><p>A support agent may have access to a customer record and still need separate consent to send it. If the consent record is unavailable, what does the system do?</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / What changed</p><h2 id="new-title">Separate agent access and check each action</h2>
          <h3>November 11 · Google Workspace begins enforcing its agentic OAuth requirement</h3>
          <p>Google’s October release notes set November 11 as the start date for rejecting requests to its Workspace MCP servers from OAuth clients that lack the agentic designation. Google says integrations that missed the November 12 cutoff need a new designated client to call those servers. REST-only integrations are unaffected. The listed MCP servers, including Gmail and Drive, remain in Developer Preview.</p>
          <p>A separate client gives teams a way to identify which integration is acting as an agent. The service still needs to check whether the requested action is allowed under the user’s permissions.</p>
          <p className="blog-source"><a href={sources.workspace}>Google Workspace developer release notes · October 12 announcement</a></p>

          <h3>November 12 · AWS maps policy checks and tracing to the agent runtime</h3>
          <p>AWS published a reference architecture that carries the caller’s identity and permissions into the runtime. It proposes a gateway that checks tool calls, a policy or approval gate for consequential actions, and a trace of tool results. For a write or send, the approval can happen at the point where the system knows the actual destination and content.</p>
          <p className="blog-source"><a href={sources.aws}>AWS Architecture Blog · governed agent reference architecture</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Missing permission records can matter more than an explicit denial</h2>
          <p>In the November 9 DeputyBench preprint, researchers tested whether enterprise agents respected authorization based on records such as individual consent. In a secondary analysis of 27 matched tasks across six models, agents executed restricted actions in 10.3% of runs with evidence hidden, compared with 3.5% when the available record showed permission was absent. Four privacy tasks accounted for most of the restricted actions in the hidden-evidence condition. These figures describe the benchmark, and the authors’ outcome scorer still made errors in a separate validation set.</p>
          <p>The November 12 ReA-Bench preprint examines the other side of the tool call. Its authors test whether auditors catch problems in records of agent activity, including cases where an agent reports success after an operation failed. They deliberately include legitimate actions that resemble risky ones, so the benchmark’s false-positive rates cannot be carried over to production traffic.</p>
          <p className="blog-source"><a href={sources.deputyBench}>DeputyBench · preprint v1, November 9</a><br /><a href={sources.reaBench}>ReA-Bench · preprint v1, November 12</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">Where this is heading</h2>
          <p>Our reading is that an action should wait when a record required to authorize it is unavailable. If the action goes ahead, the service that handled it should be able to substantiate the outcome. A tool log can help an investigator find the request. The affected service can tell them whether it took effect.</p>
          <p>At IETF 127 on November 17, the proposed AUDIT working group is up for discussion. The session will ask whether a group should form and what agent interaction and delegation records it should address. The chairs plan to focus on scope and use cases.</p>
          <p className="blog-source"><a href={sources.ietf}>IETF AUDIT session chairs · November 8 discussion note</a></p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / What to watch</p><h2 id="watch-title">Three checks for a real workflow</h2>
          <ul>
            <li>When an approval or consent lookup fails, does the workflow hold the action and explain which evidence it needs?</li>
            <li>Does the approval cover the actual recipient and data the agent is about to send?</li>
            <li>If the agent reports success, can the receiving system confirm what happened?</li>
          </ul>
        </section>
        <div><p className="blog-source">Published by AgentAction, which develops controls for agent actions.</p><p><a href="/blog/agentic-iam-digest-2026-11-07">Previous issue (November 1–7)</a> · <a href="/blog">All digests</a></p></div>
      </div>
    </article>
  </main>;
}
