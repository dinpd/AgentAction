import catalog from "./catalog.json" with { type: "json" };

export type Observation = Record<string, string | number | boolean>;
export type Recipe = {
  schemaVersion: number;
  id: string;
  version: string;
  title: string;
  category: string;
  summary: string;
  mode: string;
  intent: string;
  publisher: { name: string; url: string; kind: string };
  evidence: { level: string; description: string };
  servers: { name: string; purpose: string; tools: string[] }[];
  boundaries: string[];
  instructions: string[];
  outcomes: {
    id: string;
    label: string;
    field: string;
    equals: string | number | boolean;
  }[];
  fixtures: {
    id: string;
    title: string;
    observation: Observation;
    expected: string;
  }[];
};
export const recipes: Recipe[] = catalog as Recipe[];
export const recipeById = (id: string) =>
  recipes.find((recipe) => recipe.id === id);
export function evaluate(recipe: Recipe, observation: Observation) {
  const checks = recipe.outcomes.map((rule) => ({
    ...rule,
    actual: observation[rule.field],
    verdict: !Object.hasOwn(observation, rule.field)
      ? "indeterminate"
      : observation[rule.field] === rule.equals
        ? "met"
        : "not_met",
  }));
  const verdict = checks.some((c) => c.verdict === "not_met")
    ? "not_met"
    : checks.some((c) => c.verdict === "indeterminate")
      ? "indeterminate"
      : "met";
  return { verdict, checks };
}
export function runFixtures(recipe: Recipe) {
  return recipe.fixtures.map((fixture) => {
    const result = evaluate(recipe, fixture.observation);
    return { ...fixture, ...result, passed: result.verdict === fixture.expected };
  });
}
export function starter(recipe: Recipe, name: string) {
  const agentName =
    name
      .replace(/[\r\n\x00-\x1f\x7f]/g, " ")
      .trim()
      .slice(0, 80) || recipe.title;
  return {
    format: "agentaction-recipe-starter/v1",
    agentName,
    recipe: { ...recipe },
    connections: recipe.servers.map((server) => ({
      name: server.name,
      endpoint: "",
      requiredTools: server.tools,
    })),
    setup: [
      "Configure each MCP server in your agent runtime; keep credentials out of this file.",
      "Load the recipe instructions and review boundaries with your team.",
      "Run sandbox cases with your agent and collect actual tool outcomes before enabling real actions.",
      "Connect your runtime to AgentAction, then configure Evals and inspect Jobs. Fixture checks do not install runtime controls.",
    ],
  };
}
export function starterMarkdown(recipe: Recipe, name: string) {
  const bundle = starter(recipe, name);
  return `# ${bundle.agentName}\n\nRecipe: ${recipe.id}@${recipe.version}\nPublisher: ${recipe.publisher.name}\n\n## Goal\n${recipe.intent}\n\n## Required MCP connections\n${recipe.servers.map((s) => `- ${s.name}: ${s.tools.join(", ")}`).join("\n")}\n\n## Boundaries\n${recipe.boundaries.map((s) => `- ${s}`).join("\n")}\n\n## Instructions\n${recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n## Completion evidence\n${recipe.outcomes.map((c) => `- ${c.label}: ${c.field} = ${JSON.stringify(c.equals)}`).join("\n")}\n\n## Adoption steps\n${bundle.setup.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nEvidence level: ${recipe.evidence.description}\n`;
}
