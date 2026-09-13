import { RuntimeError, boundedText, object, parseEndpointURL } from "./mcp-client.ts";

export type EndpointApproval = { endpoint: string; approvedBy: string; approvedAt: string };
export type EndpointAccess = { deployment: string[]; workspace: EndpointApproval[] };

export function publicEndpointURL(value: unknown): string {
  if (typeof value !== "string" || !/^https:\/\//i.test(value) || /[\s\\{}]/.test(value)) throw new RuntimeError("Use an unambiguous public HTTPS endpoint without spaces or URL templates.");
  const url = new URL(parseEndpointURL(value));
  const host = url.hostname;
  if (host.length > 253 || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".") || host.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /\.(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)) {
    throw new RuntimeError("Use a public DNS hostname. IP addresses and local or reserved hostnames cannot be approved.");
  }
  return url.href;
}

export function isPublicAddress(address: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
    const p = address.split(".").map(Number), [a,b,c] = p;
    if (p.some(n => n > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  try {
    const host = new URL(`https://[${address}]/`).hostname.slice(1, -1);
    const sides = host.split("::"), left = sides[0] ? sides[0].split(":") : [], right = sides[1] ? sides[1].split(":") : [];
    const groups = sides.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
    if (groups.length !== 8) return false;
    const [a,b] = groups.map(v => parseInt(v, 16));
    // Only global unicast, excluding protocol assignments, documentation and
    // transition mechanisms (which can embed an otherwise private IPv4).
    return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 && !(a === 0x2001 && (b < 0x200 || b === 0xdb8)) && !(a === 0x3fff && b <= 0x0fff);
  } catch { return false; }
}

// Public DNS checking is defense in depth. Production MCP traffic must use the
// Workers global fetch with global_fetch_strictly_public, never a private/VPC
// binding. That network boundary covers DNS changes between this check and fetch.
export async function validatePublicEndpoint(value: unknown, fetcher: typeof fetch = (input, init) => fetch(input, init)): Promise<string> {
  const endpoint = publicEndpointURL(value), hostname = new URL(endpoint).hostname;
  try {
    const results = await Promise.all(["A", "AAAA"].map(async type => {
      const url = new URL("https://cloudflare-dns.com/dns-query"); url.searchParams.set("name", hostname); url.searchParams.set("type", type);
      const response = await fetcher(url.href, { headers: { accept: "application/dns-json" }, redirect: "manual", signal: AbortSignal.timeout(5000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error("DNS unavailable"); }
      const result = object(JSON.parse(await boundedText(response, 32768)));
      if (result.Status !== 0 || result.TC === true || (result.Answer !== undefined && !Array.isArray(result.Answer))) throw new Error("DNS unavailable");
      const answers = (result.Answer || []) as unknown[];
      if (answers.length > 64) throw new Error("Too many DNS records");
      return answers.map(object);
    }));
    let addresses = 0;
    for (const answer of results.flat()) {
      if (answer.type === 5) {
        if (typeof answer.data !== "string") throw new Error("Invalid CNAME");
        publicEndpointURL(`https://${answer.data.replace(/\.$/, "")}/`);
      } else if (answer.type === 1 || answer.type === 28) {
        if (typeof answer.data !== "string" || !isPublicAddress(answer.data)) throw new Error("Nonpublic address");
        addresses++;
      }
    }
    if (!addresses) throw new Error("No public address");
    return endpoint;
  } catch { throw new RuntimeError("This endpoint could not be verified as public. Check its DNS configuration; private, reserved or unresolved destinations are blocked.", 400); }
}
