// Read-only loopback dashboard for screen capture. No credentials or run controls.
import { criteria } from "./criteria.mjs";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runDirectory = resolve(process.argv[2] ?? `${root}/results/local`);
const port = Number(process.argv[3] ?? 8799);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("invalid port");
const html = readFileSync(resolve(root, "dashboard.html"));
const server = createServer((request, response) => {
  // No CORS; no path traversal or arbitrary filesystem access.
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return;
  }
  if (request.url === "/criteria") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(criteria)); return;
  }
  if (request.url === "/data") {
    try {
      const data = JSON.parse(readFileSync(resolve(runDirectory, "summary.json")));
      const rows = readFileSync(resolve(runDirectory, "raw.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      response.setHeader("Content-Type", "application/json");
      let progress = null;
      try { progress = JSON.parse(readFileSync(resolve(runDirectory, "progress.json"))); } catch {}
      response.end(JSON.stringify({ engines: data.engines, groq_model: data.groq_model, comparison: data.comparison, llm_model: data.llm_model, provider: data.provider, complete: data.complete, created_at: data.created_at, model: data.model, stages: data.stages, rows, progress }));
    } catch { response.writeHead(503); response.end('{"pending":true}'); }
    return;
  }
  response.writeHead(404); response.end();
});
server.listen(port, "127.0.0.1", () => console.log(`Read-only benchmark dashboard: http://127.0.0.1:${port}`));
