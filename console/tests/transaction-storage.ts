/** Serial, rollback-capable transaction adapter for in-memory runtime fixtures. */
const queues = new WeakMap<object, Promise<unknown>>();
export function testTransaction<T>(storage: { data: Map<string, unknown> }, work: (tx: { get<V>(key: string): Promise<V | undefined>; put<V>(key: string, value: V): Promise<void> }) => Promise<T>): Promise<T> {
  const task = (queues.get(storage) || Promise.resolve()).then(async () => {
    const data = structuredClone(storage.data);
    const result = await work({
      async get<V>(key: string) { return structuredClone(data.get(key)) as V | undefined; },
      async put<V>(key: string, value: V) {
        if (new TextEncoder().encode(JSON.stringify(value)).byteLength >= 128000) throw new Error('Test storage value exceeds the Worker limit');
        data.set(key, structuredClone(value));
      },
    });
    storage.data = data;
    return result;
  });
  queues.set(storage, task.catch(() => {})); return task;
}
