import { parse, type DefaultTreeAdapterMap } from "parse5";
import { publicEndpointURL, validatePublicEndpoint } from "./endpoint-policy.ts";
import { boundedText, RuntimeError } from "./mcp-client.ts";
import type { Handler, Observation } from "./recurring-types.ts";

type Node = DefaultTreeAdapterMap["node"];
type Seo = { title: string; description: string; canonical: string; noindex: boolean };
type SiteState = { failures?: number; lastSeoAt?: number; seo?: Seo; previousSeo?: Seo; lastStatus?: number; latencyMs?: number; availability?: string; checkedUrl?: string };
const day = 86400000;
export function inspectHtml(html: string, headers: Headers, url: string): Seo {
  let title = "", description = "", canonical = "", noindex = /\b(?:noindex|none)\b/i.test(headers.get("x-robots-tag") || "");
  const text = (node: Node): string => "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : "";
  const visit = (node: Node) => {
    if ("tagName" in node) {
      const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
      if (node.tagName === "title" && !title) title = text(node).trim().slice(0, 300);
      if (node.tagName === "meta" && attrs.name?.toLowerCase() === "description") description = (attrs.content || "").trim().slice(0, 300);
      if (node.tagName === "meta" && ["robots", "googlebot"].includes(attrs.name?.toLowerCase()) && /\b(?:noindex|none)\b/i.test(attrs.content || "")) noindex = true;
      if (node.tagName === "link" && attrs.rel?.toLowerCase().split(/\s+/).includes("canonical") && attrs.href) {
        try { const c = new URL(attrs.href, url); if (["http:", "https:"].includes(c.protocol) && !c.username && !c.password) canonical = c.href.slice(0, 512); } catch { /* Invalid canonical stays missing. */ }
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(parse(html)); return { title, description, canonical, noindex };
}

export const websiteHealth: Handler = {
  id: "website-health", version: "1.0.0", title: "Website Health",
  description: "Check a public page for availability and daily technical SEO changes. Repeated failures confirm an incident; email follows workspace routing.",
  inputs: [{ name: "url", label: "Page URL", type: "url", required: true, maxLength: 512 }, { name: "expectedText", label: "Expected page content (optional)", type: "text", maxLength: 200 }, { name: "allowedOrigins", label: "Approved redirect origins (optional, one per line; includes page origin)", type: "lines", maxLength: 1536 }],
  validate(config) {
    const url = publicEndpointURL(config.url);
    if (url.length > 512 || (config.expectedText !== undefined && (typeof config.expectedText !== "string" || config.expectedText.length > 200))) throw new RuntimeError("Use a URL under 512 characters and expected content under 200 characters.");
    const origins = config.allowedOrigins ?? [new URL(url).origin];
    if (!Array.isArray(origins) || origins.length < 1 || origins.length > 3) throw new RuntimeError("Approve one to three exact HTTPS origins for redirects.");
    const allowedOrigins = [...new Set(origins.map(o => new URL(publicEndpointURL(o)).origin))];
    if (!allowedOrigins.includes(new URL(url).origin)) throw new RuntimeError("The page origin must be included in the approved origins.");
    return { url, expectedText: config.expectedText || "", allowedOrigins };
  },
  async check(config, prior, context) {
    const state: SiteState = structuredClone(prior), observations: Observation[] = [];
    const seoDue = context.baseline || !state.lastSeoAt || context.now - state.lastSeoAt >= day;
    const observation = (key: string, present: boolean, severity: Observation["severity"], title: string, detail: string) => observations.push({ key, state: present ? "present" : "absent", severity, title, detail });
    let url = String(config.url), response: Response | undefined, html = "", unavailable = false, incomplete = false;
    const start = Date.now(), signal = AbortSignal.timeout(20000);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!(config.allowedOrigins as string[]).includes(new URL(url).origin)) throw new RuntimeError("Redirect left the approved origins. Review the page URL and redirect scope.");
      // The production fetch additionally enforces global_fetch_strictly_public.
      await validatePublicEndpoint(url, context.fetcher);
      if (signal.aborted) throw new RuntimeError("Probe deadline exceeded before a complete observation.");
      try {
        response = await context.fetcher(url, { redirect: "manual", signal, headers: { "user-agent": "AgentAction-WebsiteHealth/1.0", "cache-control": "no-cache", accept: "text/html,application/xhtml+xml" } });
      } catch { unavailable = true; break; }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location"); await response.body?.cancel();
        if (!location || redirects === 3) throw new RuntimeError("Redirect chain could not be completed within three redirects.");
        url = publicEndpointURL(new URL(location, url).href); continue;
      }
      unavailable = !response.ok;
      if (response.ok && (seoDue || config.expectedText)) {
        if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); incomplete = true; }
        else {
          try { html = await boundedText(response, 524288); }
          catch { incomplete = true; }
        }
      } else await response.body?.cancel();
      break;
    }
    if (incomplete) throw new RuntimeError("The page was reachable but its HTML could not be inspected within the content and size limits.");
    if (config.expectedText && !unavailable && !html.includes(String(config.expectedText))) unavailable = true;
    state.failures = unavailable ? (context.previousComplete === false ? 0 : state.failures || 0) + 1 : 0;
    state.lastStatus = response?.status || 0; state.latencyMs = Date.now() - start; state.checkedUrl = url;
    state.availability = unavailable ? state.failures >= 2 ? "unavailable" : "suspected failure" : "available";
    const confirmed = state.failures >= 2;
    if (!unavailable || confirmed) observation("availability", confirmed, "critical", "Page availability problem", `${String(config.url)} — ${response ? `HTTP ${response.status}` : "request failed or timed out"}; expected content ${config.expectedText ? "checked" : "not configured"}. ${confirmed ? "Two or more consecutive checks failed from the same monitoring location." : "The page is available again."}`);
    if (!unavailable && seoDue) {
      const seo = inspectHtml(html, response!.headers, url), previous = state.seo;
      observation("noindex", seo.noindex, "critical", "Page requests exclusion from search indexing", `${url} — robots metadata or X-Robots-Tag contains noindex/none.`);
      observation("title", !seo.title, "warning", "Page title is missing", `${url} — add a descriptive HTML title.`);
      observation("description", !seo.description, "warning", "Meta description is missing", `${url} — add a useful search description.`);
      observation("canonical", !seo.canonical, "warning", "Canonical link is missing or invalid", `${url} — review the preferred canonical URL.`);
      if (previous) for (const key of ["title", "description", "canonical"] as const) observation(`${key}-changed`, previous[key] !== seo[key], "info", `Page ${key} changed`, `${url} — the saved ${key} differs from the previous complete SEO snapshot. Review both snapshots in the console.`);
      if (previous) state.previousSeo = previous;
      state.seo = seo; state.lastSeoAt = context.now;
    }
    return { state, observations, complete: true, summary: `${state.availability}; HTTP ${state.lastStatus || "unknown"}; ${state.latencyMs} ms. ${!unavailable && seoDue ? "SEO snapshot inspected." : "SEO not inspected on this check."}` };
  },
};
