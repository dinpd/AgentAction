import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../site-header";
import { loadProductNewsHistory } from "../public-news";
import "./whats-new.css";

export const metadata: Metadata = {
  title: "What's New",
  description: "Recent AgentAction capabilities, integrations and workflow improvements, with public feature highlights and release details.",
  alternates: { canonical: "https://agentaction.dev/whats-new" },
  openGraph: { title: "What's New in AgentAction", url: "https://agentaction.dev/whats-new", type: "website" },
};

export default async function WhatsNew() {
  const highlights = await loadProductNewsHistory();
  return (
    <div className="news-shell">
      <a className="skip-link" href="#news-content">Skip to content</a>
      <SiteHeader />
      <main id="news-content" className="news-page">
        <header className="news-intro">
          <p className="eyebrow">AgentAction / Product updates</p>
          <h1>What’s new<br />in AgentAction.</h1>
          <p>New capabilities for controlling agent actions and understanding their outcomes.</p>
        </header>
        <section className="news-history" aria-label="Recent feature highlights">
          {highlights.map((news) => (
            <article className="news-item" id={`release-${news.tag.slice(1).replaceAll('.', '-')}`} key={news.tag}>
              <div className="news-date">
                <time dateTime={news.date}>{new Date(`${news.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
                <span className="news-status">{news.prerelease ? "Release candidate" : "Feature release"}</span>
              </div>
              <div className="news-copy">
                <h2>{news.title}</h2>
                <p>{news.summary}</p>
                <a className="news-source" href={news.href}>Release notes <span aria-hidden="true">↗</span><span className="sr-only"> for {news.title}, {news.tag}</span></a>
              </div>
            </article>
          ))}
        </section>
      </main>
      <footer className="news-footer">
        <Link href="/">Back to AgentAction</Link>
        <Link href="/blog">Read the Agentic IAM digest</Link>
      </footer>
    </div>
  );
}
