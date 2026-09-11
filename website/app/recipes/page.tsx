import type { Metadata } from "next";
import { RecipeDirectory } from "./recipe-directory";
export const metadata: Metadata = {
  title: "Agent recipes",
  description:
    "Adopt useful agent recipes with explicit MCP connections, operating boundaries and inspectable test cases.",
  alternates: { canonical: "https://agentaction.dev/recipes" },
};
export default function RecipesPage() {
  return <RecipeDirectory />;
}
