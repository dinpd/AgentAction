import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";

const python = process.env.RESEARCH_PYTHON ?? "python3";
const provider = fileURLToPath(new URL("./persistent_provider.py", import.meta.url));
const auditor = fileURLToPath(new URL("./audit_provider.py", import.meta.url));
export type HttpTrace = { order: number; method: string; path: string; status: number | "response_lost" };

// Use node:http, not global fetch: the production JWS fixture deliberately
// intercepts fetch to allow only its exact in-process JWKS URL.
export class Service {
  database: string;
  port = 0;
  process?: ChildProcess;
  trace: HttpTrace[] = [];
  constructor(database: string) { this.database = database; }
  async start() {
    const child = spawn(python, [provider, this.database], { stdio: ["ignore", "pipe", "pipe"] });
    this.process = child;
    let errors = "";
    child.stderr!.on("data", b => { errors += String(b); });
    const lines = createInterface({ input: child.stdout! });
    this.port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("Provider startup timed out: " + errors)); }, 10000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Provider exited ${code}: ${errors}`)); });
      lines.once("line", line => { clearTimeout(timer); lines.close(); resolve(JSON.parse(line).port); });
    });
  }
  async stop(signal: NodeJS.Signals = "SIGTERM") {
    const child = this.process;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill(signal); });
    this.process = undefined;
  }
  async call(method: "GET" | "POST", path: string, body?: unknown, record = true): Promise<any> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Only local relative routes are allowed");
    const entry: HttpTrace = { order: this.trace.length + 1, method, path: path.split("?")[0], status: 0 };
    if (record) this.trace.push(entry);
    const data = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = httpRequest({ hostname: "127.0.0.1", port: this.port, path, method,
        headers: data === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, res => {
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", b => {
          length += b.length;
          if (length > 2 * 1024 * 1024) req.destroy(new Error("Provider response exceeded bound"));
          else chunks.push(b);
        });
        res.on("end", () => {
          entry.status = res.statusCode ?? 0;
          try {
            const value = JSON.parse(Buffer.concat(chunks).toString());
            if (entry.status >= 400) reject(new Error(`HTTP ${entry.status}: ${JSON.stringify(value)}`));
            else resolve(value);
          } catch (error) { reject(error); }
        });
        res.on("error", reject);
      });
      req.setTimeout(15000, () => req.destroy(new Error("Local provider request timed out")));
      req.on("error", error => { entry.status = "response_lost"; reject(error); });
      req.end(data);
    });
  }
  async waitReady(name: string) {
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      if ((await this.call("GET", "/barrier?name=" + encodeURIComponent(name), undefined, false)).ready) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("Writer did not reach pre-commit barrier");
  }
  audit(job: string) {
    const r = spawnSync(python, [auditor, this.database, job], { encoding: "utf8", timeout: 10000 });
    if (r.status !== 0) throw new Error(`Independent auditor failed: ${r.stderr || r.error}`);
    return JSON.parse(r.stdout);
  }
}
