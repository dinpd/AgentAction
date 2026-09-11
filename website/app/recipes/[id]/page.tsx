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
          {recipe.adoption && <section className="recipe-section">
            <h2>Example result</h2>
            <p className="recipe-example-label">Illustrative output using synthetic data.</p>
            <pre className="recipe-example">{recipe.adoption.exampleOutput}</pre>
          </section>}
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
                {s.connection && <div className="recipe-connection-setup">
                  <p><strong>Endpoint:</strong> <code>{s.connection.endpoint}</code></p>
                  <p>{s.connection.authentication}</p>
                  <a href={s.connection.documentation}>Provider setup documentation ↗</a>
                </div>}
                <div>
                  {s.tools.map((t) => (
                    <code key={t}>{t}</code>
                  ))}
                </div>
              </article>
            ))}
          </section>
          {recipe.adoption && <section className="recipe-section">
            <h2>Make it work in your environment</h2>
            <dl className="recipe-inputs">
              {recipe.adoption.inputs.map((i) => <div key={i.name}>
                <dt>{i.name}</dt><dd>{i.description}<p>Example: {i.example}</p></dd>
              </div>)}
            </dl>
            <h3>Runtime requirements</h3>
            <ul>{recipe.adoption.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>}
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
          {recipe.adoption && <section className="recipe-section">
            <h2>Validate with your agent</h2>
            <p>Run these procedures in your sandbox. They are a test plan, not completed live-agent tests.</p>
            {recipe.adoption.validation.map((v) => <article className="recipe-connection" key={v.name}>
              <h3>{v.name}</h3><p>{v.procedure}</p><p><strong>Expected:</strong> {v.expected}</p>
            </article>)}
          </section>}
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
