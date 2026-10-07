import { SiteHeader } from "../site-header";
import Link from "next/link";
import "./blog.css";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell">
      <a className="skip-link" href="#blog-content">Skip to content</a>
      <SiteHeader />
      {children}
      <footer className="blog-footer">
        <Link href="/">AgentAction</Link>
        <Link href="/blog">All posts</Link>
        <Link href="/landscape">Agent trust landscape</Link>
      </footer>
    </div>
  );
}
