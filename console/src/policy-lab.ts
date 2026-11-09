import type { RuntimeStorage } from './agent-runtime.ts';
import { readGovernance } from './governance-evidence.ts';
import { FINDING_CATEGORIES, governanceInsights, type FindingCategory, type ReviewStatus } from './governance-insights.ts';
import { boundedText, object, RuntimeError } from './mcp-client.ts';
import { proposePolicyCandidate, replayPolicy } from './policy-replay.ts';

const REVIEWS_KEY = 'policy-lab-reviews';
const REVIEW_STATUSES = ['reviewed', 'dismissed', 'candidate'] as const;
type Review = { id: string; status: Exclude<ReviewStatus, 'open'>; actor: string; at: string };

export function isPolicyLabRoute(path: string): boolean {
  return ['/policy-lab', '/policy-lab-replay', '/policy-lab-review'].includes(path);
}

function filters(query: Record<string, unknown>, now: number) {
  const {days = '30', agentId, category} = query;
  if (typeof days !== 'string' || !['7', '30', '90'].includes(days) || (agentId !== undefined &&
      (typeof agentId !== 'string' || !/^[\w-]{1,128}$/.test(agentId))) ||
      (category !== undefined && (typeof category !== 'string' || !Object.hasOwn(FINDING_CATEGORIES, category)))) {
    throw new RuntimeError('Choose a valid Policy Lab agent, category and time window.');
  }
  return {from: now - Number(days) * 86_400_000, to: now, agentId: agentId as string | undefined, category: category as FindingCategory | undefined};
}

export async function handlePolicyLab(storage: RuntimeStorage, request: Request, url: URL) {
  const read = url.pathname === '/policy-lab';
  if (request.method !== (read ? 'GET' : 'POST')) throw new RuntimeError('Route not found.', 404);
  const workspace = request.headers.get('x-runtime-workspace');
  const actor = request.headers.get('x-runtime-actor');
  const role = request.headers.get('x-runtime-role');
  if (!workspace || !actor || !['owner', 'operator', 'viewer'].includes(role ?? '') || (!read && role === 'viewer')) {
    throw new RuntimeError('Policy Lab requires an authorized workspace member.', 403);
  }
  const saved = await storage.get<string>('oauth-workspace');
  if (saved && saved !== workspace) throw new RuntimeError('Workspace context mismatch.', 403);
  const now = Date.now();
  const body = read ? Object.fromEntries(url.searchParams) : object(JSON.parse(await boundedText(new Response(request.body), 2048)));
  const allowed = read ? ['days', 'agentId', 'category'] : ['days', 'agentId', 'category', 'findingId',
    url.pathname === '/policy-lab-review' ? 'status' : 'candidateId'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new RuntimeError('Unknown Policy Lab input.');
  const window = filters(body, now);
  const data = await readGovernance(storage, workspace, now);
  const insights = await governanceInsights(data.runs, window);

  if (read) {
    const reviews = new Map((await storage.get<Review[]>(REVIEWS_KEY) ?? []).map(review => [review.id, review.status]));
    const findings = await Promise.all(insights.findings.map(async finding => ({
      ...finding, review: reviews.get(finding.id) ?? 'open', candidate: await proposePolicyCandidate(finding, data.runs),
    })));
    return {...insights, findings, scannedRuns: data.scannedRuns, scanTruncated: data.truncated};
  }
  const finding = insights.findings.find(item => item.id === body.findingId);
  if (!finding) throw new RuntimeError('Finding is unavailable in this workspace and window. Refresh Policy Lab.', 404);
  if (url.pathname === '/policy-lab-replay') {
    const candidate = await proposePolicyCandidate(finding, data.runs);
    if (!candidate || candidate.id !== body.candidateId) throw new RuntimeError('Candidate changed or is unavailable. Refresh Policy Lab.', 409);
    return replayPolicy(candidate, data.runs, window);
  }
  const status = REVIEW_STATUSES.find(value => value === body.status);
  if (!status) throw new RuntimeError('Choose reviewed, dismissed, or candidate.');
  await storage.transaction(async tx => {
    const reviews = await tx.get<Review[]>(REVIEWS_KEY) ?? [];
    const review = {id: finding.id, status, actor, at: new Date(now).toISOString()};
    await tx.put(REVIEWS_KEY, [...reviews.filter(item => item.id !== finding.id), review].slice(-200));
  });
  return {id: finding.id, status};
}
