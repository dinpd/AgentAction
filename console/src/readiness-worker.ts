import { boundedText, RuntimeError } from './mcp-client.ts';
import { parseCheck } from './readiness-store.ts';
import { READINESS_HTML, READINESS_CSS, READINESS_JS } from './readiness-ui.ts';
import { faviconBytes } from './favicon.ts';
export { McpReadiness } from './readiness-do.ts';

function response(body: string | Uint8Array, type = 'application/json; charset=utf-8', status = 200): Response {
  return new Response(body, { status, headers: {
    'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  } });
}
export default {
  async fetch(request: Request, env: ReadinessEnv): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET') {
        if (url.pathname === '/' || /^\/reports\/[a-f0-9]{64}$/.test(url.pathname)) return response(READINESS_HTML, 'text/html; charset=utf-8');
        if (url.pathname === '/assets/check.css') return response(READINESS_CSS, 'text/css; charset=utf-8');
        if (url.pathname === '/assets/check.js') return response(READINESS_JS, 'text/javascript; charset=utf-8');
        if (url.pathname === '/favicon.png') return response(faviconBytes(), 'image/png');
        if (/^\/api\/reports\/[a-f0-9]{64}$/.test(url.pathname)) {
          const result = await env.MCP_READINESS.getByName('public-v1').get(url.pathname.split('/').pop()!);
          return response(JSON.stringify(result || { error: 'Report not found or no longer retained.' }), undefined, result ? 200 : 404);
        }
        return response(JSON.stringify({ error: 'Not found.' }), undefined, 404);
      }
      if (request.method !== 'POST' || !['/api/check', '/api/lookup'].includes(url.pathname)) return response(JSON.stringify({ error: 'Method not allowed.' }), undefined, 405);
      if (request.headers.get('origin') !== url.origin || request.headers.get('x-readiness-request') !== 'mcp-check' || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RuntimeError('Use the same-origin checker form.', 403);
      let raw: string;
      try { raw = await boundedText(new Response(request.body), url.pathname === '/api/check' ? 4096 : 380000); }
      catch { throw new RuntimeError('Request body exceeds the checker limit.', 413); }
      let input: unknown;
      try { input = JSON.parse(raw); } catch { throw new RuntimeError('Provide valid JSON.'); }
      if (url.pathname === '/api/lookup') return response(JSON.stringify(await env.MCP_READINESS.getByName('public-v1').lookup(input as string[])));
      const parsed = parseCheck(input);
      const address = request.headers.get('cf-connecting-ip');
      if (!address || !env.CHECK_LIMITER) throw new RuntimeError('The public checker is unavailable. Please try again later.', 503);
      if (!(await env.CHECK_LIMITER.limit({ key: address })).success) throw new RuntimeError('Too many checks. Try again in one minute.', 429);
      const result = await env.MCP_READINESS.getByName('public-v1').check(parsed);
      if (result.ok === false) return response(JSON.stringify({ error: result.error }), undefined, result.status);
      return response(JSON.stringify(result.result));
    } catch (error) {
      return response(JSON.stringify({ error: error instanceof RuntimeError ? error.message : 'The checker is temporarily unavailable.' }), undefined, error instanceof RuntimeError ? error.status : 503);
    }
  },
};
