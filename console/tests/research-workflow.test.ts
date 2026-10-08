import test from 'node:test';
import assert from 'node:assert/strict';
import { researchWorkflow, RESEARCH_CLASSIFICATION_INSTRUCTIONS, AGENT_MODEL } from '../src/research-workflow.ts';
import { researchConfig } from '../src/research-digest.ts';
import { evidenceDigest } from '../src/recipe-evaluation.ts';
import { researchStepEvidence } from '../src/workflow-inspector.ts';
import type { Run } from '../src/agent-runtime.ts';

const config = researchConfig({ connectionId: 'apify', topics: 'Retirement tools', queries: { reddit: ['retirement'], x: ['planning'] }, recipient: 'reports@example.com', time: '08:00', timezone: 'America/Los_Angeles', maxItems: 20, actorCapUsd: 0.05, xActorCapUsd: 0.01, rollingCapUsd: 4, freePlan: true });

test('workflow connections are typed, ordered and reflect the actual server procedure', () => {
  const workflow = researchWorkflow(config);
  assert.deepEqual(workflow.steps.map(s => s.id), ['schedule', 'retrieve', 'validate', 'classify', 'checks', 'compose', 'deliver', 'outcome']);
  const preceding = new Map<string, Map<string, string>>();
  for (const step of workflow.steps) {
    assert.ok(!preceding.has(step.id));
    for (const input of step.inputs) if (input.from) assert.equal(preceding.get(input.from.step)?.get(input.from.output), input.type, `${step.id}.${input.name}`);
    preceding.set(step.id, new Map(step.outputs.map(o => [o.name, o.type])));
  }
  const ai = workflow.steps.find(s => s.kind === 'ai')!;
  assert.equal(ai.settings.instructions, RESEARCH_CLASSIFICATION_INSTRUCTIONS);
  assert.equal(ai.settings.model, AGENT_MODEL);
  assert.equal(workflow.steps.find(s => s.id === 'retrieve')!.settings.maxCalls, 20);
  assert.deepEqual(workflow.steps.find(s => s.id === 'retrieve')!.settings.chargeCapsUsd, { reddit: 0.05, x: 0.01 });
  assert.equal(workflow.mode, 'executable');
  assert.ok(JSON.stringify(workflow).length < 10000);
});

test('scope digests cover instruction and connection revisions', async () => {
  const workflow = researchWorkflow(config), digest = await evidenceDigest({ config, workflow });
  for (const change of ['instructions', 'wiring']) {
    const revised = structuredClone(workflow);
    if (change === 'instructions') revised.steps[3].settings.instructions = 'Changed instructions';
    else revised.steps[3].inputs[0].from!.output = 'another-output';
    assert.notEqual(await evidenceDigest({ config, workflow: revised }), digest);
  }
  assert.equal(await evidenceDigest({ config, workflow: researchWorkflow(config) }), digest);
});

test('step evidence preserves gaps, unknown decisions and uncertain delivery', () => {
  const run: Run = { id: 'run', agentId: 'agent', kind: 'trial', actor: 'owner', status: 'executing', startedAt: '2026-10-07T15:00:00Z', tokens: 0, events: [], research: { definition: { config, digest: 'scope', tools: [] }, deadline: 1, sources: [{ platform: 'reddit', stage: 'done', polls: 1, received: 1, invalid: 0, duplicates: 0, outsideWindow: 0, posts: [{ platform: 'reddit', url: 'https://www.reddit.com/r/example/comments/abc/topic', at: '2026-10-07T14:00:00Z', text: 'Legacy candidate', reason: 'Previously retained selection' }] }, { platform: 'x', stage: 'unavailable', gap: 'Provider failed', polls: 0, received: 0, invalid: 0, duplicates: 0, outsideWindow: 0, posts: [] }], delivery: { status: 'uncertain' } } };
  assert.equal(researchStepEvidence('retrieve', run).status, 'Coverage gap');
  assert.equal(researchStepEvidence('classify', run).status, 'Decision snapshot unavailable');
  assert.equal((researchStepEvidence('classify', run).data as any).candidates[0].decision, 'Unknown');
  assert.equal(researchStepEvidence('checks', run).status, 'Checks unavailable');
  assert.equal(researchStepEvidence('deliver', run).status, 'uncertain');
  assert.equal(researchStepEvidence('outcome', run).status, 'Outcome unavailable');
  assert.equal(researchStepEvidence('missing', run).trust, 'Unknown');
});
