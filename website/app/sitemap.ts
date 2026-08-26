import type { MetadataRoute } from "next";

const siteOrigin = "https://agentaction.dev";
const lastModified = "2026-08-26";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
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
