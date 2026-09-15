import catalog from "./catalog.json" with { type: "json" };

export type Observation = Record<string, string | number | boolean>;
export type Recipe = {
  schemaVersion: number;
  runtime?: "recurring";
  id: string;
  version: string;
  title: string;
  category: string;
  summary: string;
  mode: string;
  intent: string;
  publisher: { name: string; url: string; kind: string };
  evidence: { level: string; description: string };
  servers: {
    name: string;
    purpose: string;
    tools: string[];
    connection?: { endpoint: string; documentation: string; authentication: string };
  }[];
  adoption?: {
    inputs: { name: string; example: string; description: string }[];
    requirements: string[];
    exampleOutput: string;
    validation: { name: string; procedure: string; expected: string }[];
  };
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
      endpoint: server.connection?.endpoint ?? "",
      ...(server.connection ? {
        documentation: server.connection.documentation,
        authentication: server.connection.authentication,
      } : {}),
      requiredTools: server.tools,
    })),
    setup: recipe.runtime === "recurring" ? [
      "Open Recurring agents in your AgentAction workspace and choose this recipe.",
      "Configure targets and workspace email destinations; keep private values out of exported starters.",
      "Run a baseline, review evidence, then authorize the bounded recurring schedule.",
      "Inspect Findings, Recent runs and notification delivery history in Recurring agents.",
    ] : [
      "Configure each MCP server in your agent runtime; keep credentials out of this file.",
      "Load the recipe instructions and review boundaries with your team.",
      "Run sandbox cases with your agent and collect actual tool outcomes before enabling real actions.",
      "Connect your runtime to AgentAction, then configure Evals and inspect Jobs. Fixture checks do not install runtime controls.",
    ],
  };
}
export function starterMarkdown(recipe: Recipe, name: string) {
  const bundle = starter(recipe, name);
  const bullets = (items: string[]) => items.map((s) => `- ${s}`).join("\n");
  const steps = (items: string[]) => items.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const connections = recipe.servers.map((server) => {
    const lines = [`- ${server.name}: ${server.tools.join(", ")}`];
    if (server.connection) {
      lines.push(
        `  Endpoint: ${server.connection.endpoint}`,
        `  Setup: ${server.connection.documentation}`,
        `  Access: ${server.connection.authentication}`,
      );
    }
    return lines.join("\n");
  });
  const sections = [
    `# ${bundle.agentName}`,
    `Recipe: ${recipe.id}@${recipe.version}\nPublisher: ${recipe.publisher.name}`,
    `## Goal\n${recipe.intent}`,
    recipe.runtime === "recurring" ? "## Runtime\nAgentAction recurring workflows with built-in public web checks and workspace email notifications." : `## Required MCP connections\n${connections.join("\n")}`,
  ];
  if (recipe.adoption) {
    const a = recipe.adoption;
    sections.push(
      `## Your inputs\n${bullets(a.inputs.map((i) => `${i.name}: ${i.description}\n  Example: ${i.example}`))}`,
      `## Runtime requirements\n${bullets(a.requirements)}`,
      `## Example output (synthetic)\n${a.exampleOutput}`,
      `## Validate with your agent\nThese are procedures to run in your sandbox, not completed live-agent tests.\n${steps(a.validation.map((v) => `${v.name}: ${v.procedure}\n   Expected: ${v.expected}`))}`,
    );
  }
  sections.push(
    `## Boundaries\n${bullets(recipe.boundaries)}`,
    `## Instructions\n${steps(recipe.instructions)}`,
    `## Completion evidence\n${bullets(recipe.outcomes.map((c) => `${c.label}: ${c.field} = ${JSON.stringify(c.equals)}`))}`,
    `## Adoption steps\n${steps(bundle.setup)}`,
    `Evidence level: ${recipe.evidence.description}`,
  );
  return sections.join("\n\n") + "\n";
}
