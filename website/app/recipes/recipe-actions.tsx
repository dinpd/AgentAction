"use client";
import { useState } from "react";
import { type Recipe, runFixtures } from "../../../recipes/registry";
export function RecipeAdoption({ recipe }: { recipe: Recipe }) {
  const [name, setName] = useState(recipe.title);
  const downloadUrl = `/recipes/${recipe.id}/download?name=${encodeURIComponent(name)}`;
  const consoleUrl = `https://observability-console.agentaction.dev/agents?recipe=${encodeURIComponent(recipe.id)}&recipe_version=${encodeURIComponent(recipe.version)}#create`;
  return (
    <aside className="recipe-adopt" aria-label="Adopt this recipe">
      <p className="eyebrow">MAKE IT YOURS</p>
      <h2>Use this recipe</h2>
      <p>Choose your workspace, review required MCP tools, and configure a draft in Create. Run a supervised trial when you are ready.</p>
      <a className="recipe-button" href={consoleUrl}>Use this recipe →</a>
      <h3>Use another runtime</h3>
      <p>Download the same version’s instructions and connection checklist for your own runtime.</p>
      <label>
        Agent name
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <a
        className="recipe-button"
        href={`${downloadUrl}&format=markdown`}
        download
      >
        Download agent instructions
      </a>
      <a
        className="recipe-button secondary"
        href={`${downloadUrl}&format=json`}
        download
      >
        Download recipe bundle
      </a>
    </aside>
  );
}
export function RecipeTests({ recipe }: { recipe: Recipe }) {
  const [ran, setRan] = useState(false);
  const results = runFixtures(recipe);
  return (
    <section className="recipe-section" aria-labelledby="recipe-tests-title">
      <div className="recipe-test-head">
        <div>
          <h2 id="recipe-tests-title">Inspect the test cases</h2>
          <p>{recipe.evidence.description}</p>
        </div>
        <button
          className="recipe-button secondary"
          onClick={() => setRan(true)}
        >
          Run fixture checks
        </button>
      </div>
      {ran && (
        <p className="recipe-test-status" role="status">
          {results.filter((r) => r.passed).length} of {results.length} fixture
          checks passed. Outcome rules checked locally; no agent or server was
          called.
        </p>
      )}
      {results.map((r) => (
        <details className="recipe-test-row" key={r.id}>
          <summary>
            <span>{r.title}</span>
            <span className="recipe-check-result">
              {ran ? (r.passed ? "PASS · " : "FAIL · ") : ""}Expected:{" "}
              {r.expected.replace("_", " ")}
            </span>
          </summary>
          <pre>{JSON.stringify(r.observation, null, 2)}</pre>
          <p>
            Expected evaluation: <strong>{r.expected}</strong>
            {ran && (
              <>
                {" "}
                · Actual: <strong>{r.verdict}</strong>
              </>
            )}
          </p>
          <ul>
            {r.checks.map((c) => (
              <li key={c.id}>
                {c.label}:{" "}
                {ran
                  ? c.verdict.replace("_", " ")
                  : `expects ${JSON.stringify(c.equals)}`}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
