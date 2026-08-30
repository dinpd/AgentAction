import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createPublicDemoEnv } from "../src/demo-fixtures.ts";
import worker from "../src/worker.ts";

const configuredPort = Number(process.env.PORT || "8791");
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65_536
  ? configuredPort
  : 8791;
const stale = process.env.AGENTPASS_FIXTURE_STALE === "true";
const env = createPublicDemoEnv({ stale });

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const origin = `http://127.0.0.1:${port}`;
    const workerRequest = new Request(new URL(request.url || "/", origin), {
      method: request.method || "GET",
      headers: requestHeaders(request),
    });
    const workerResponse = await worker.fetch(workerRequest, env);
    response.statusCode = workerResponse.status;
    workerResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await workerResponse.arrayBuffer()));
  } catch {
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Fixture console unavailable.");
  }
}

const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AgentAction fixture console: http://127.0.0.1:${port}`);
  if (stale) console.log("Serving rollups older than the console freshness threshold.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
