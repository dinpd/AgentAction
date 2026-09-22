import { inspectEndpoint, type PrecheckReport } from './mcp-precheck.ts';
import { RuntimeError } from './mcp-client.ts';
import { publicEndpointURL } from './endpoint-policy.ts';
import { digest, READINESS_PROTOCOLS, summarizeReadiness, type ReadinessSummary } from './mcp-readiness.ts';

type Storage = { sql: { exec(query: string, ...args: (string | number)[]): { toArray(): Record<string, unknown>[] } }; transactionSync<T>(work: () => T): T };
export type CheckInput = { endpoint: string; protocol: string; publish: boolean };
export type PublishedCheck = { id: string | null; report: PrecheckReport; published: boolean };
export function parseCheck(value: unknown): CheckInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeError('Provide an endpoint, protocol and publication choice.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(k => !['endpoint', 'protocol', 'publish'].includes(k)) || typeof input.publish !== 'boolean' || !READINESS_PROTOCOLS.includes(input.protocol as typeof READINESS_PROTOCOLS[number])) throw new RuntimeError('Choose a supported protocol and an explicit publication preference. Credentials and extra fields are not accepted.');
  return { endpoint: publicEndpointURL(input.endpoint), protocol: String(input.protocol), publish: input.publish };
}
/** Separate from tenant storage. Only the probe can create evidence; no imported reports. */
export class ReadinessStore {
  private storage: Storage;
  private inspect: typeof inspectEndpoint;
  private clock: () => number;
  private active = 0;
  constructor(storage: Storage, inspect = inspectEndpoint, clock = Date.now) {
    this.storage = storage; this.inspect = inspect; this.clock = clock;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS readiness_reports (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, checked INTEGER NOT NULL, payload TEXT NOT NULL)');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS readiness_endpoint ON readiness_reports(endpoint, checked DESC)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS readiness_budget (id INTEGER PRIMARY KEY, day TEXT NOT NULL, used INTEGER NOT NULL)');
  }
  async check(raw: unknown): Promise<PublishedCheck> {
    const input = parseCheck(raw);
    if (this.active >= 3) throw new RuntimeError('The checker is busy. Try again shortly.', 429);
    this.storage.transactionSync(() => {
      const day = new Date(this.clock()).toISOString().slice(0, 10);
      const row = this.storage.sql.exec('SELECT day, used FROM readiness_budget WHERE id = 1').toArray()[0];
      const used = row?.day === day ? Number(row.used) : 0;
      if (used >= 100) throw new RuntimeError('The public preview has reached its daily limit of 100 checks. Try again tomorrow.', 429);
      this.storage.sql.exec('INSERT OR REPLACE INTO readiness_budget VALUES (1, ?, ?)', day, used + 1);
    });
    this.active++;
    try {
      const report = await this.inspect(input.endpoint, input.protocol);
      if (!input.publish) return { id: null, report, published: false };
      const payload = JSON.stringify(report), id = await digest(payload);
      if (new TextEncoder().encode(payload).byteLength > 250000) throw new RuntimeError('The report exceeds publication limits.', 413);
      this.storage.transactionSync(() => {
        this.storage.sql.exec('INSERT OR REPLACE INTO readiness_reports VALUES (?, ?, ?, ?)', id, input.endpoint, Date.parse(report.checkedAt), payload);
        this.storage.sql.exec('DELETE FROM readiness_reports WHERE id IN (SELECT id FROM readiness_reports ORDER BY checked DESC, id DESC LIMIT -1 OFFSET 1000)');
      });
      return { id, report, published: true };
    } finally { this.active--; }
  }
  get(id: string): PublishedCheck | null {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new RuntimeError('Invalid report ID.');
    const row = this.storage.sql.exec('SELECT payload FROM readiness_reports WHERE id = ?', id).toArray()[0];
    return row ? { id, report: JSON.parse(String(row.payload)), published: true } : null;
  }
  lookup(endpoints: unknown): ReadinessSummary[] {
    if (!Array.isArray(endpoints) || endpoints.length > 180 || endpoints.some(e => typeof e !== 'string' || e.length > 2048)) throw new RuntimeError('Provide up to 180 endpoint URLs.');
    return [...new Set(endpoints as string[])].flatMap(endpoint => {
      const row = this.storage.sql.exec('SELECT id, payload FROM readiness_reports WHERE endpoint = ? ORDER BY checked DESC, id DESC LIMIT 1', endpoint).toArray()[0];
      if (!row) return [];
      const report = JSON.parse(String(row.payload)) as PrecheckReport;
      return report.readiness ? [summarizeReadiness(String(row.id), report.readiness, this.clock())] : [];
    });
  }
}
