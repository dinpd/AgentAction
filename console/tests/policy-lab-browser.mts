import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import worker from '../src/worker.ts';
import {policyLabWorkspace, seedPolicyLab} from './policy-lab-fixture.ts';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const workspaces = {acme: policyLabWorkspace(), beta: policyLabWorkspace()};
await seedPolicyLab('acme', workspaces.acme.runtime);
let role = 'operator';
const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url!, 'https://console.test');
  const env = {CONSOLE_ENABLE_MOCK_IDENTITY: 'true', CONSOLE_ENVIRONMENT: 'development',
    CONSOLE_MOCK_SUBJECT: 'reviewer', CONSOLE_MOCK_TENANT_ID: 'acme'};
  let response: Response;
  if (url.pathname === '/api/console/session') {
    response = Response.json({email: 'reviewer@example.com', memberships: Object.keys(workspaces).map(id =>
      ({tenant: {tenant_id: id, display_name: id}, membership: {role}}))});
  } else if (url.pathname.startsWith('/api/agents/')) {
    const [,,, workspace, action] = url.pathname.split('/');
    let body = '';
    for await (const chunk of incoming) body += chunk;
    response = await workspaces[workspace as keyof typeof workspaces].runtime.handle(new Request('https://runtime.test/' + action + url.search, {
      method: incoming.method, ...(body ? {body} : {}),
      headers: {'x-runtime-role': role, 'x-runtime-actor': 'reviewer', 'x-runtime-workspace': workspace},
    }));
  } else if (url.pathname.startsWith('/api/')) {
    response = Response.json({jobs: [], runs: [], findings: [], membership: {role}});
  } else {
    response = await worker.fetch(new Request(url), env);
  }
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1360, height: 900}});
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(10_000);
try {
  const port = (server.address() as {port: number}).port;
  await page.goto(`http://127.0.0.1:${port}/agents?workspace=acme#run`);
  await page.getByRole('link', {name: /Improve controls/}).click();
  await page.getByRole('heading', {name: 'Policy Lab', exact: true}).waitFor();
  const panel = page.locator('#policy-lab');
  const uncertainty = panel.locator('[data-finding-category="execution_uncertainty"]');
  await uncertainty.getByText('Supporting evidence').click();
  await uncertainty.getByRole('link', {name: /Open run/}).waitFor();
  await uncertainty.getByText('Policy change candidate').click();
  await uncertainty.getByRole('button', {name: 'Run historical replay'}).click();
  await uncertainty.getByText(/4 compared.*1 newly denied.*0 newly allowed/).waitFor();
  await uncertainty.getByLabel('Set review status').selectOption('candidate');
  await uncertainty.getByRole('button', {name: 'Save review'}).click();
  await uncertainty.getByText('Review saved.', {exact: true}).waitFor();
  await panel.getByLabel('Category').selectOption('repeated_denials');
  await panel.getByRole('heading', {name: 'Repeated denials'}).waitFor();
  assert.equal(await uncertainty.count(), 0);
  await panel.getByLabel('Time window').selectOption('7');
  await panel.getByLabel('Agent', {exact: true}).selectOption({label: 'Hermes support'});
  await panel.getByRole('heading', {name: 'Repeated denials'}).waitFor();
  assert.equal(await panel.getByText(/Correct tool selection/).count(), 1);

  await page.getByRole('combobox', {name: 'Workspace', exact: true}).selectOption('beta');
  await panel.getByText(/No findings match/).waitFor();
  assert.equal(await panel.getByText('Hermes support').count(), 0);

  role = 'viewer';
  await page.goto(`http://127.0.0.1:${port}/agents?workspace=acme#policy-lab`);
  await uncertainty.getByText('Review status · Candidate for future action').waitFor();
  assert.equal(await panel.getByRole('button', {name: 'Save review'}).count(), 0);
  await uncertainty.getByText('Policy change candidate').click();
  assert.equal(await panel.getByRole('button', {name: 'Run historical replay'}).count(), 0);
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  assert.equal(workspaces.acme.calls(), 0);
  console.log('Policy Lab browser acceptance passed: navigation, filters, evidence, candidate replay, persistent review, workspace isolation, viewer access and mobile layout.');
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
