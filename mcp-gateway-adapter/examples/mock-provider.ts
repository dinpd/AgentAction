import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 8790;

const tools = [
  {
    name: "provider.crm.search_customer",
    description: "Search customer records in the provider CRM.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        job_id: { type: "string" },
        case_id: { type: "string" },
      },
      required: ["customer_id", "job_id", "case_id"],
    },
  },
  {
    name: "provider.crm.update_customer",
    description: "Update customer records in the provider CRM.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        job_id: { type: "string" },
        case_id: { type: "string" },
        approved: { type: "boolean" },
        jit_grant_id: { type: "string" },
      },
      required: ["customer_id", "job_id", "case_id"],
    },
  },
  {
    name: "provider.admin.delete_customer",
    description: "Administrative delete operation intentionally not mapped in AgentID.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
];

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  const body = JSON.parse(await readBody(request));
  const result = handleRequest(body);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(result));
});

server.listen(port, host, () => {
  console.log(`Mock provider MCP server listening on http://${host}:${port}/mcp`);
});

function handleRequest(request: { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> }) {
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id, result: { tools } };
  }

  if (request.method === "tools/call") {
    const name = request.params?.name;
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [
          {
            type: "text",
            text: `mock provider executed ${String(name)}`,
          },
        ],
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: `method not found: ${request.method}` },
  };
}

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
