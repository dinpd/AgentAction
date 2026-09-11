import Link from "next/link";
import { Brand } from "../brand";
import "./recipes.css";
export default function RecipeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#recipe-main">
        Skip to recipes
      </a>
      <header className="site-header recipe-header">
        <Brand href="/" />
        <nav aria-label="Main navigation">
          <Link href="/recipes" aria-current="page">
            Agent recipes
          </Link>
          <Link href="/recipes/publish">Publish a recipe</Link>
          <a href="https://observability-console.agentaction.dev/">
            Open console ↗
          </a>
        </nav>
      </header>
      {children}
      <footer className="recipe-footer">
        <span>AgentAction / Agent recipes</span>
        <span>Start with a job. Make the outcome observable.</span>
      </footer>
    </>
  );
}
