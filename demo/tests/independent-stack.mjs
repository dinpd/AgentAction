import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(fileURLToPath(new URL('..', import.meta.url)));
async function ports(count) {
  const sockets = await Promise.all(Array.from({ length: count }, () => new Promise(resolve => {
    const server = createServer(); server.listen(0, '127.0.0.1', () => resolve(server));
  })));
  const values = sockets.map(server => server.address().port);
  await Promise.all(sockets.map(server => new Promise(resolve => server.close(resolve))));
  return values;
}
export async function startIndependentStack() {
  const directory = await mkdtemp(join(tmpdir(), 'agentaction-390-'));
  const values = await ports(4);
  const specs = [
    { name: 'authority', config: 'authority.wrangler.toml', path: '/health' },
    { name: 'payments', config: 'payments.wrangler.toml', path: '/health' },
    { name: 'support', config: 'support.wrangler.toml', path: '/health' },
    { name: 'frontend', config: 'wrangler.toml', path: '/shared-authority' },
  ].map((item, index) => ({ ...item, port: values[index], process: null }));
  const origin = name => 'http://127.0.0.1:' + specs.find(s => s.name === name).port;
  async function start(name) {
    const item = specs.find(s => s.name === name);
    const log = await open(join(directory, name + '.log'), 'a');
    const child = spawn(process.execPath, [join(cwd, 'node_modules/wrangler/bin/wrangler.js'),
      'dev', '-c', item.config, '--local', '--port', String(item.port), '--inspector-port', '0',
      '--persist-to', join(directory, 'state-' + name)], {
      cwd, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(directory, 'logs') },
      stdio: ['ignore', log.fd, log.fd],
    });
    item.process = child;
    await log.close();
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(name + ' exited; inspect ' + directory);
      try { if ((await fetch(origin(name) + item.path, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(name + ' did not become ready; inspect ' + directory);
  }
  async function stop(name) {
    const child = specs.find(s => s.name === name).process;
    if (!child || child.exitCode !== null) return;
    const done = new Promise(resolve => child.once('exit', resolve));
    // Wrangler's wrapper forwards SIGINT to the actual Worker process.
    child.kill('SIGINT');
    const timer = setTimeout(() => child.kill('SIGKILL'), 7000);
    await done; clearTimeout(timer);
  }
  async function close() { await Promise.all(specs.map(s => stop(s.name))); }
  try {
    await start('authority');
    await Promise.all([start('payments'), start('support')]);
    await start('frontend');
    return { origin, directory, start, stop, close };
  } catch (error) { await close(); throw error; }
}
