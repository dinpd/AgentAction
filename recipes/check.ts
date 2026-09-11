import { recipes, runFixtures } from "./registry.ts";
import { validateCatalog } from "./validate.ts";
validateCatalog(recipes);
for (const recipe of recipes)
  console.log(
    `${recipe.id}@${recipe.version}: ${runFixtures(recipe).length} fixture checks passed (synthetic observations; no live agent run)`,
  );
