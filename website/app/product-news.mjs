// Only public release metadata crosses this boundary; no GitHub token is needed.
export const RELEASES_URL = 'https://api.github.com/repos/dinpd/AgentAction/releases?per_page=30';
const RELEASE_ROOT = 'https://github.com/dinpd/AgentAction/releases/tag/';
const MAX_BYTES = 256 * 1024;

function plainText(value) {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function firstBullet(body, heading) {
  const section = body.match(new RegExp(`^### ${heading}\\s*\\n([\\s\\S]*?)(?=^#{1,3} |$(?![\\s\\S]))`, 'm'))?.[1];
  return section?.match(/^[-*] (.+(?:\n[ \t]+[^\n]+)*)/m)?.[1];
}

export function selectProductNews(releases) {
  if (!Array.isArray(releases)) return null;
  const candidates = releases.flatMap((release) => {
    if (!release || release.draft !== false || typeof release.body !== 'string' || release.body.length > MAX_BYTES) return [];
    const version = /^v(\d+)\.(\d+)\.0(?:-rc\.[1-9]\d*)?$/.exec(release.tag_name);
    if (!version || (Number(version[1]) === 0 && Number(version[2]) === 0)) return [];
    if (typeof release.published_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(release.published_at) || !Number.isFinite(Date.parse(release.published_at))) return [];
    const added = firstBullet(release.body, 'Added');
    if (!added) return [];
    const highlight = firstBullet(release.body, 'Website highlight');
    if (!highlight) return [];
    const text = plainText(highlight);
    if (!text) return [];
    const colon = text.indexOf(': ');
    if (colon <= 0 || colon > 90) return [];
    const title = text.slice(0, colon);
    const summary = text.slice(colon + 2);
    if (!summary || summary.length > 230) return [];
    return [{
      title,
      summary,
      date: release.published_at.slice(0, 10),
      publishedAt: release.published_at,
      tag: release.tag_name,
      prerelease: release.prerelease === true || release.tag_name.includes('-rc.'),
      href: `${RELEASE_ROOT}${release.tag_name}`,
    }];
  });
  return candidates.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null;
}

async function boundedJson(response) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Release feed unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Release feed too large');
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    await reader.cancel();
  }
}

export function createProductNewsLoader(fallback, { fetcher = fetch, now = Date.now, timeoutMs = 2000 } = {}) {
  let latest = fallback;
  let expires = 0;
  let pending;
  return async function loadProductNews() {
    if (now() < expires) return latest;
    if (pending) return pending;
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(RELEASES_URL, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AgentAction-website' },
          signal: controller.signal,
          redirect: 'error',
        });
        const candidate = selectProductNews(await boundedJson(response));
        if (candidate && (!latest || Date.parse(candidate.publishedAt) >= Date.parse(latest.publishedAt))) latest = candidate;
        expires = now() + (candidate ? 60 * 60 * 1000 : 5 * 60 * 1000);
      } catch {
        // Keep the last verified highlight, including on rate limits and timeout.
        expires = now() + 5 * 60 * 1000;
      } finally {
        clearTimeout(timeout);
      }
      return latest;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}
