import assert from 'node:assert/strict';
import { AgentRuntime, type Run, type RuntimeStorage } from '../src/agent-runtime.ts';
import { testTransaction } from './transaction-storage.ts';

class Storage implements RuntimeStorage {
  data = new Map<string, unknown>();
  transaction<T>(work: (tx: Pick<RuntimeStorage, 'get' | 'put'>) => Promise<T>) { return testTransaction(this, work); }
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { this.data.set(key, structuredClone(value)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({prefix, limit}: {prefix: string; limit?: number}) {
    return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).slice(0, limit).map(([key, value]) => [key, structuredClone(value) as T]));
  }
  async setAlarm() {}
  async deleteAlarm() {}
}

export function policyLabWorkspace() {
  const storage = new Storage();
  let externalCalls = 0;
  const runtime = new AgentRuntime(storage, {}, async () => {
    externalCalls++;
    throw new Error('Unexpected provider call');
  });
  return {storage, runtime, calls: () => externalCalls};
}

export async function seedPolicyLab(workspace: string, runtime: AgentRuntime) {
  const call = async (path: string, body: object, role = 'operator', token = '') => {
    const response = await runtime.handle(new Request('https://runtime.test/' + path, {
      method: 'POST', body: JSON.stringify(body),
      headers: {'x-runtime-workspace': workspace, 'x-runtime-role': role, 'x-runtime-actor': 'reviewer', authorization: token ? 'Bearer ' + token : ''},
    }));
    return {status: response.status, value: await response.json() as any};
  };
  const registration = await call('external-register', {title: 'Hermes support', tools: ['refund']}, 'owner');
  assert.equal(registration.status, 200);
  const {agentId, token} = registration.value;
  const machine = async (action: string, body: object, expected = 200) => {
    const result = await call('external/' + action, {...body, agentId}, 'external', token);
    assert.equal(result.status, expected, JSON.stringify(result.value));
    return result.value;
  };
  const {runId} = await machine('start', {sessionId: 'synthetic-refunds'});
  for (let i = 0; i < 2; i++) await machine('propose', {runId, tool: 'PRIVATE_outside_tool', arguments: {secret: 'PRIVATE'}}, 403);
  for (let i = 0; i < 4; i++) {
    const {actionId, bindingDigest} = await machine('propose', {runId, tool: 'refund', arguments: {paymentId: 'PRIVATE_' + i, amount: 10}});
    const {pending} = ((await runtime.snapshot()).runs as Run[]).find(item => item.id === runId)!;
    assert.equal((await call('approve', {runId, approvalId: pending!.id})).status, 200);
    assert.equal((await machine('claim', {runId, actionId, bindingDigest})).claimed, true);
    await machine('complete', {runId, actionId, status: i === 3 ? 'uncertain' : 'succeeded'});
  }
  return {runId, agentId, token};
}
