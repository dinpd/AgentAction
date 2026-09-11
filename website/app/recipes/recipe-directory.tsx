"use client";
import { useState } from "react";
import Link from "next/link";
import { recipes, runFixtures } from "../../../recipes/registry";

export function RecipeDirectory() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("All recipes");
  const filtered = [...recipes].sort((a, b) => Number(!!b.adoption) - Number(!!a.adoption)).filter(
    (r) =>
      (mode === "All recipes" || r.mode === mode) &&
      [
        r.title,
        r.summary,
        r.category,
        r.publisher.name,
        ...r.servers.map((s) => s.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <main id="recipe-main" className="recipe-shell">
      <div className="recipe-intro">
        <div>
          <p className="eyebrow">THE RECIPE DIRECTORY</p>
          <h1>What should your agent get done?</h1>
          <p>
            Start with a useful job, the connections it needs, and checks you
            can inspect.
          </p>
        </div>
        <Link className="recipe-publish-link" href="/recipes/publish">
          Build a recipe for your server <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="recipe-toolbar">
        <label className="recipe-search">
          <span>Find a recipe</span>
          <input
            type="search"
            placeholder="Search jobs, servers, or publishers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span>Action scope</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option>All recipes</option>
            <option>Read only</option>
            <option>Supervised actions</option>
          </select>
        </label>
      </div>
      <div className="recipe-result-line">
        <p role="status">
          {filtered.length} {filtered.length === 1 ? "recipe" : "recipes"}
        </p>
        <span>Maintainer starters · open to provider contributions</span>
      </div>
      <div className="recipe-grid">
        {filtered.map((r) => (
          <Link href={`/recipes/${r.id}`} key={r.id} className="recipe-card">
            <div className="recipe-card-top">
              <span>{r.category}</span>
            </div>
            <h2>{r.title}</h2>
            <div className="recipe-provider">
              <span>{r.servers.every((s) => s.connection) ? "Powered by" : "Required servers"}</span>
              <strong>{r.servers.map((s) => s.name).join(" + ")}</strong>
            </div>
            <p>{r.summary}</p>
            <div className="recipe-card-evidence">
              <span>
                {runFixtures(r).filter((f) => f.passed).length} fixture checks
                pass
              </span>
              <span>{r.mode}</span>
            </div>
            <div className="recipe-card-footer">
              <span>
                Recipe maintained by {r.publisher.name}
              </span>
              <strong aria-label="Explore recipe">↗</strong>
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <div className="recipe-empty">
          <h2>No recipes match that search</h2>
          <p>Try a job such as “pricing” or a server such as “Intercom”.</p>
          <button
            className="recipe-button"
            onClick={() => {
              setQuery("");
              setMode("All recipes");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <aside className="recipe-evidence-note">
        <strong>Know what was tested.</strong>
        <p>
          These first recipes include synthetic fixture checks of their outcome
          rules. Live agent performance and your server connections need to be
          tested in your environment. Every recipe shows its evidence level.
        </p>
      </aside>
    </main>
  );
}
