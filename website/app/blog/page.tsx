import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { posts } from "./posts";

export const metadata: Metadata = {
  title: "Blog",
  description: "Agentic IAM digests and analysis of identity, delegated authority, action controls, and evidence for autonomous agents.",
  alternates: { canonical: "https://agentaction.dev/blog" },
  openGraph: { title: "AgentAction Blog", url: "https://agentaction.dev/blog", type: "website" },
};

export default function Blog() {
  return <main id="blog-content" className="blog-index">
    <header className="blog-intro"><p className="eyebrow">AgentAction / Blog</p><h1>Agents, authority,<br />and what comes next.</h1><p>Reporting and analysis on agentic identity and access management: what changed, what is available, and where the field is heading.</p></header>
    <div className="blog-posts">{posts.map((post) => <article className="blog-preview" key={post.slug}>
      <Link href={`/blog/${post.slug}`} className="blog-cover" aria-label={post.title}><Image src={post.image} alt={post.imageAlt} width={1672} height={941} unoptimized sizes="(max-width: 720px) 100vw, 550px" /></Link>
      <div><p className="blog-meta">Agentic IAM digest · Issue 01</p><p className="blog-meta">{post.window}</p><h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.description}</p><Link href={`/blog/${post.slug}`} className="blog-read">Read the digest</Link></div>
    </article>)}</div>
  </main>;
}
