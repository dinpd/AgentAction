import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Publish an agent recipe",
  description:
    "Help users adopt your MCP server through a useful agent recipe with reproducible tests.",
  alternates: { canonical: "https://agentaction.dev/recipes/publish" },
};
const root = "https://github.com/dinpd/AgentAction";
export default function PublishRecipe() {
  return (
    <main id="recipe-main" className="recipe-shell">
      <Link href="/recipes" className="recipe-breadcrumb">
        ← All agent recipes
      </Link>
      <div className="recipe-intro">
        <div>
          <p className="eyebrow">FOR SERVER PROVIDERS</p>
          <h1>Give your server a useful starting point.</h1>
          <p>
            Publish a recipe that shows users what they can accomplish, how to
            get started, and what you have tested.
          </p>
        </div>
      </div>
      <div className="recipe-publish-steps">
        <article>
          <p className="eyebrow">01 / DEFINE THE JOB</p>
          <h2>Lead with an outcome</h2>
          <p>
            Name a specific task. Include the tools your server provides, any
            companion servers, the agent instructions, and its operating
            boundaries.
          </p>
        </article>
        <article>
          <p className="eyebrow">02 / SHOW YOUR WORK</p>
          <h2>Include reproducible checks</h2>
          <p>
            Provide synthetic fixtures for success, failure, and missing
            evidence. State exactly what was tested and keep live-run evidence
            distinct from fixture checks.
          </p>
        </article>
        <article>
          <p className="eyebrow">03 / PUBLISH THROUGH REVIEW</p>
          <h2>Give users a recipe to adopt</h2>
          <p>
            Submit a pull request with your versioned recipe. Maintainers review
            attribution, permissions, and test evidence before it appears in the
            directory.
          </p>
        </article>
      </div>
      <section className="recipe-section">
        <h2>Start from the recipe format</h2>
        <p>
          The directory currently accepts reviewed repository contributions.
          Publisher attribution is reviewed; it is not an automatic verification
          badge. There is no listing fee or credential upload in this flow.
        </p>
        <div className="recipe-server-chain">
          <a
            className="recipe-button"
            href={`${root}/blob/main/recipes/CONTRIBUTING.md`}
          >
            Open publishing guide ↗
          </a>
          <a
            className="recipe-button secondary"
            href={`${root}/blob/main/recipes/catalog.json`}
          >
            View recipe examples ↗
          </a>
          <a
            className="recipe-button secondary"
            href={`${root}/issues/new?template=recipe-submission.yml`}
          >
            Propose a recipe ↗
          </a>
        </div>
      </section>
      <aside className="recipe-evidence-note">
        <strong>What goes in a listing?</strong>
        <p>
          Your publisher identity, a versioned job definition, required tools,
          operating boundaries, starter instructions, completion evidence, and
          reproducible test fixtures. Never submit customer data, access tokens,
          or invented performance claims.
        </p>
      </aside>
    </main>
  );
}
