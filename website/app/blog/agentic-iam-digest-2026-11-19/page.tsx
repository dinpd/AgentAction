import type { Metadata } from "next";
import Image from "next/image";
import { posts } from "../posts";

const post = posts.find((entry) => entry.slug === "agentic-iam-digest-2026-11-19")!;
const url = `https://agentaction.dev/blog/${post.slug}`;
const sources = {
  entra: "https://techcommunity.microsoft.com/blog/microsoft-entra-blog/ai-is-changing-access-see-how-microsoft-entra-helps-you-stay-ahead-/4556456",
  conditionalAccess: "https://learn.microsoft.com/en-us/entra/identity/conditional-access/agent-id",
  aws: "https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-harness-adds-strands-harness-defaults-built-in-tools-and-lifecycle-hooks/",
  hooks: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-lifecycle-hooks.html",
  okta: "https://developer.okta.com/docs/release-notes/2026-okta-identity-engine/#version-2026-47-1",
  events: "https://developer.okta.com/docs/reference/api/event-types/?q=agent_gateway",
  research: "https://arxiv.org/abs/2611.21259v1",
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
        <h1>When agent access<br />needs to change.</h1>
        <p className="blog-deck">Agentic IAM digest · {post.window}. New controls address changing risk, tool approvals, and access after deactivation. The practical question is how quickly a decision reaches the next action.</p>
        <div className="blog-byline"><span>By AgentAction</span><span>Published <time dateTime={post.date}>November 20, 2026</time></span><span>3 minute read</span></div>
      </header>
      <figure className="blog-hero">
        <Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized priority sizes="(max-width: 1100px) 100vw, 1100px" />
        <figcaption>One path closes while another stays open. AI-generated editorial illustration.</figcaption>
      </figure>
      <div className="blog-body">
        <nav className="blog-contents" aria-label="In this digest"><a href="#new">What changed</a><a href="#research">Research signals</a><a href="#vector">Longer-term vector</a><a href="#watch">What to watch</a></nav>
        <div className="blog-callout"><p>An agent can start with appropriate access and lose the justification for it halfway through a task. Risk can rise, an owner can withdraw approval, or the next tool call can need a different level of authority.</p></div>

        <section id="new" aria-labelledby="new-title">
          <p className="eyebrow">01 / What changed</p><h2 id="new-title">Put the changed decision in the execution path</h2>
          <h3>November 17 · Microsoft previews access controls that distinguish the agent from its user</h3>
          <p>At Ignite, Microsoft introduced previews for assigning identities to discovered local agents and applying Conditional Access to agents assisting a person. Its Dynamic Agent Risk preview combines identity, data, endpoint, and runtime signals. The intended result is finer control, such as restricting a sensitive operation while allowing routine work to continue.</p>
          <p>The timing of enforcement matters. Microsoft’s Conditional Access documentation says policies are evaluated when an access token is issued or refreshed. Some resources support Continuous Access Evaluation for specific events. A team evaluating the previews needs to check how its target service handles a token issued before risk changed.</p>
          <p className="blog-source"><a href={sources.entra}>Microsoft Entra Ignite announcements · November 17</a><br /><a href={sources.conditionalAccess}>Conditional Access for agents · evaluation timing</a></p>

          <h3>November 18 · Okta documents evidence of access denied after agent deactivation</h3>
          <p>Okta’s release notes list new Agent Gateway events for preview organizations. One records a denied request from an agent deactivated after its access token was issued. Administrators can correlate the agent’s identifier with its deactivation record. The event reference tags these events for release 2026.48.0, so availability should be checked against the organization’s deployed version.</p>
          <p>The record gives operators something concrete to test after withdrawing access. It covers the gateway’s rejection of that request. A call already accepted by a downstream service needs its own completion or cancellation evidence.</p>
          <p className="blog-source"><a href={sources.okta}>Okta Identity Engine release notes · November 18 preview schedule</a><br /><a href={sources.events}>Agent Gateway event definitions and version tags</a></p>

          <h3>November 19 · AWS adds tool-call checks to its managed agent harness</h3>
          <p>Amazon Bedrock AgentCore harness now supports lifecycle hooks. A synchronous Lambda hook can inspect a proposed tool call and deny it before execution. The tool-call hooks also apply to the harness’s subagents. On a denial, the harness skips that call and lets the agent continue, for example to explain that approval is needed.</p>
          <p>Placement changes what a hook can do. A check after a tool call sees a result after the operation has happened. SNS and EventBridge hooks send notifications without blocking the loop. Lambda hook failures default to denial, with a configurable failure mode. Teams still supply the policy code that decides whether an action is allowed.</p>
          <p className="blog-source"><a href={sources.aws}>AWS harness update · November 19</a><br /><a href={sources.hooks}>AgentCore lifecycle hook behavior</a></p>
        </section>

        <section id="research" aria-labelledby="research-title">
          <p className="eyebrow">02 / Research signals</p><h2 id="research-title">Check authority again when work crosses a boundary</h2>
          <p>A November 16 preprint examines twelve experiments across LangChain, LangGraph, AutoGen, and OpenClaw, using gpt-4o-mini throughout. The tested attacks include unauthorized tool chaining, stale filesystem checks, and delegation to another agent. Protected configurations blocked specific operations through authorization checks, controlled capabilities, or execution safeguards.</p>
          <p>Some protections were supplied by the application. These results describe the tested configurations and model, and enterprise credential systems were not comprehensively evaluated. The practical lesson is to test the boundary where a proposed operation becomes executable, including a handoff to another agent.</p>
          <p className="blog-source"><a href={sources.research}>Evaluating Authorization and Trust Boundaries in Agentic Orchestration Frameworks · preprint v1, November 16</a></p>
        </section>

        <section id="vector" aria-labelledby="vector-title">
          <p className="eyebrow">03 / Context and direction</p><h2 id="vector-title">Where this is heading</h2>
          <p>Our reading is that access reviews need to include the transition between two decisions. Withdraw an agent’s access, then observe its next request. Deny one tool call, then follow the agent’s alternative. The evidence should show which policy applied, where the request stopped, and whether an earlier operation still completed.</p>
          <p>That makes recovery part of the test. A blocked action can leave useful work unfinished. The agent needs a permitted next step, and the operator needs to know whether a retry could repeat an effect that already occurred.</p>
        </section>

        <section id="watch" aria-labelledby="watch-title">
          <p className="eyebrow">04 / What to watch</p><h2 id="watch-title">Questions for an access-change test</h2>
          <ul>
            <li>After deactivation, what happens to a request carrying a still-valid token?</li>
            <li>Does a delegated tool call pass through the same policy checks as its parent’s call?</li>
            <li>If a policy service times out, which actions can proceed?</li>
            <li>Can the receiving service confirm whether work accepted before the change completed?</li>
          </ul>
        </section>
        <div><p className="blog-source">Published by AgentAction, which develops controls for agent actions.</p><p><a href="/blog/agentic-iam-digest-2026-11-12">Previous issue (November 8–12)</a> · <a href="/blog">All digests</a></p></div>
      </div>
    </article>
  </main>;
}
