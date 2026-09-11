import { recipes } from "../../recipes/registry";
import type { MetadataRoute } from "next";

const siteOrigin = "https://agentaction.dev";
const lastModified = "2026-08-26";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...[
      "/recipes",
      "/recipes/publish",
      ...recipes.map((r) => `/recipes/${r.id}`),
    ].map((path) => ({
      url: `${siteOrigin}${path}`,
      lastModified: "2026-09-11",
    })),
    {
      url: `${siteOrigin}/`,
      lastModified,
    },
    {
      url: `${siteOrigin}/gateway`,
      lastModified,
    },
    {
      url: `${siteOrigin}/landscape`,
      lastModified,
    },
  ];
}
