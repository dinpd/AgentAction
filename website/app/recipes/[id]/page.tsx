import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { recipes, recipeById } from "../../../../recipes/registry";
import { RecipeAdoption, RecipeTests } from "../recipe-actions";
export function generateStaticParams() {
  return recipes.map((r) => ({ id: r.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const recipe = recipeById((await params).id);
  return recipe
    ? {
        title: recipe.title,
        description: recipe.summary,
        alternates: {
          canonical: `https://agentaction.dev/recipes/${recipe.id}`,
        },
      }
    : { title: "Recipe not found" };
}
export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const recipe = recipeById((await params).id);
  if (!recipe) notFound();
  return (
    <main id="recipe-main" className="recipe-shell">
      <Link href="/recipes" className="recipe-breadcrumb">
        ← All agent recipes
      </Link>
      <p className="eyebrow">
        {recipe.category} / {recipe.mode}
      </p>
      <h1 className="recipe-detail-title">{recipe.title}</h1>
      <div className="recipe-detail-meta">
        <a href={recipe.publisher.url}>By {recipe.publisher.name}</a>
        <span>Version {recipe.version}</span>
        <span>Evidence: synthetic fixtures</span>
      </div>
      <div className="recipe-detail-grid">
        <div>
          <section className="recipe-section">
            <h2>The job</h2>
            <p>{recipe.intent}</p>
          </section>
          <section className="recipe-section">
            <h2>Connections you’ll need</h2>
            <p>
              Use servers that expose these tools. Review their schemas and
              permissions in your agent runtime before running the recipe.
            </p>
            {recipe.servers.map((s) => (
              <article className="recipe-connection" key={s.name}>
                <h3>{s.name}</h3>
                <p>{s.purpose}</p>
                <div>
                  {s.tools.map((t) => (
                    <code key={t}>{t}</code>
                  ))}
                </div>
              </article>
            ))}
          </section>
          <section className="recipe-section">
            <h2>Operating boundaries</h2>
            <ul>
              {recipe.boundaries.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
          <section className="recipe-section">
            <h2>What a completed job requires</h2>
            <ul>
              {recipe.outcomes.map((o) => (
                <li key={o.id}>{o.label}</li>
              ))}
            </ul>
          </section>
          <RecipeTests recipe={recipe} />
          <section className="recipe-section">
            <h2>The agent’s instructions</h2>
            <ol>
              {recipe.instructions.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ol>
          </section>
          <section className="recipe-section">
            <h2>Follow it into operation</h2>
            <p>
              Connect your agent to an AgentAction workspace. Jobs shows what
              happened on each run; Evals lets you configure evaluation
              definitions and routing. Review the provenance of each result:
              agent self-assessments and independent observations provide
              different evidence.
            </p>
            <p>
              Downloading a recipe does not connect accounts, deploy an agent,
              install controls, or configure Evals.
            </p>
          </section>
        </div>
        <RecipeAdoption recipe={recipe} />
      </div>
    </main>
  );
}
