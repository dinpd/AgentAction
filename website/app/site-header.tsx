import Link from "next/link";
import { Brand } from "./brand";

type HeaderLink = { href: string; label: string; cta?: boolean };

export function SiteHeader({ home = false }: { home?: boolean }) {
  const prefix = home ? "" : "/";
  const links: HeaderLink[] = [
    { href: `${prefix}#platform`, label: "Platform" },
    { href: "/landscape", label: "Landscape" },
    { href: `${prefix}#whats-new`, label: "Research" },
    { href: "/blog", label: "Blog" },
    { href: `${prefix}#observe`, label: "Engage", cta: true },
  ];
  return (
    <header className="site-header grouped-header">
      <Brand href={home ? "#top" : "/"} />
      <nav aria-label="Primary navigation">
        <div className="nav-group nav-explore" role="group" aria-label="Explore">
          <span className="nav-group-label" aria-hidden="true">Explore</span>
          <div className="nav-group-links">
            {links.map(({ href, label, cta }) => (
              <Link key={href} className={cta ? "nav-action" : undefined} href={href}>{label}</Link>
            ))}
          </div>
        </div>
        <div className="nav-group nav-tools" role="group" aria-label="Visitor tools">
          <span className="nav-group-label" aria-hidden="true">Tools</span>
          <div className="nav-group-links">
            <a href="https://mcpcheck.agentaction.dev">MCP Checker</a>
            <a className="nav-action" href="https://observability-console.agentaction.dev/agents">Agent Console <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <a className="nav-cta" href="https://github.com/dinpd/AgentAction">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
