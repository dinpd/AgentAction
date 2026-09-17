import { validateRecipeEval, type RecipeEval } from "./recipe-evaluation.ts";
import { object, RuntimeError, textField } from "./mcp-client.ts";

// Reusable authoring fields only. Account bindings and actual job inputs belong
// to the agent instance, never to the saved definition.
export type RecipeDefinition = {
  evaluation?: RecipeEval;
  title: string; goal: string; inputGuide: string; instructions: string;
  boundaries: string; success: string; tools: string[];
};
export type RecipeRevision = { version: number; definition: RecipeDefinition; createdAt: string };
export type WorkspaceRecipe = { id: string; revisions: RecipeRevision[] };
export const MAX_RECIPES = 24;
export const MAX_REVISIONS = 8;

export function recipeDefinition(value: unknown, availableTools: string[]): RecipeDefinition {
  const raw = object(value);
  const keys = ["title", "goal", "inputGuide", "instructions", "boundaries", "success", "tools", "evaluation"];
  if (Object.keys(raw).some(key => !keys.includes(key))) throw new RuntimeError("Recipe definitions accept only authoring fields, never account credentials or job inputs.");
  if (!Array.isArray(raw.tools) || raw.tools.length < 1 || raw.tools.length > 4 || raw.tools.some(t => typeof t !== "string" || !availableTools.includes(t)) || new Set(raw.tools).size !== raw.tools.length) throw new RuntimeError("Choose one to four distinct tools exposed by the connected server.");
  const optional = (key: string, max: number) => raw[key] === undefined || raw[key] === "" ? "" : textField(raw[key], key, max);
  const definition = { title: textField(raw.title, "recipe name", 120), goal: textField(raw.goal, "goal", 2000), inputGuide: optional("inputGuide", 1000), instructions: optional("instructions", 2000), boundaries: optional("boundaries", 1500), success: textField(raw.success, "success criteria", 2000), tools: [...raw.tools as string[]].sort(), ...(raw.evaluation === undefined ? {} : { evaluation: validateRecipeEval(raw.evaluation, raw.tools as string[]) }) };
  if (JSON.stringify(definition).length > 9000 || new TextEncoder().encode(JSON.stringify(definition)).byteLength > 12000) throw new RuntimeError("Recipe definition is too large. Keep its combined text below 9,000 characters and 12 KB.");
  return definition;
}
