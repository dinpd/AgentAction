import {
  recipeById,
  starter,
  starterMarkdown,
} from "../../../../../recipes/registry";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const recipe = recipeById((await params).id);
  if (!recipe) return new Response("Recipe not found", { status: 404 });
  const query = new URL(request.url).searchParams;
  const format = query.get("format") || "json";
  if (!["json", "markdown"].includes(format))
    return new Response("Unknown format", { status: 400 });
  const name = (query.get("name") || recipe.title).trim().slice(0, 80);
  const markdown = format === "markdown";
  return new Response(
    markdown
      ? starterMarkdown(recipe, name)
      : JSON.stringify(starter(recipe, name), null, 2),
    {
      headers: {
        "Content-Type": markdown
          ? "text/markdown; charset=utf-8"
          : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${recipe.id}-starter.${markdown ? "md" : "json"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
