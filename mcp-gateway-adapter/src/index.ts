import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

import { handleJsonRpc } from "./proxy.js";
import type { AdapterConfig, RequestContext } from "./types.js";

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: agentid-mcp-gateway <config.json>");
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, "utf8")) as AdapterConfig;
const host = config.listen?.host || "127.0.0.1";
const port = config.listen?.port || 8788;

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  try {
    const body = JSON.parse(await readBody(request));
    const result = await handleJsonRpc(body, config, contextFromHeaders(request.headers));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: String((error as Error).message) }));
  }
});

server.listen(port, host, () => {
  console.log(`AgentID MCP gateway adapter listening on http://${host}:${port}`);
});

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data || "{}"));
    request.on("error", reject);
  });
}

function contextFromHeaders(headers: NodeJS.Dict<string | string[]>): RequestContext {
  return {
    agentId: stringHeader(headers["x-agentid-agent-id"]),
    tenantId: stringHeader(headers["x-agentid-tenant-id"]),
    userId: stringHeader(headers["x-agentid-user-id"]),
  };
}

function stringHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
