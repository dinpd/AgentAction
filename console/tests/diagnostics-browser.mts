import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { observationReport, observationHtml } from '../../mcp-gateway-adapter/src/observation-report.ts';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=await mkdtemp(join(tmpdir(),'agentaction-diagnostics-browser-'));
const observation=join(directory,'observation.html'),recovery=join(directory,'recovery.html');
const event={event:'agentaction.mcp.observation',mode:'observe',tool:'refund',evaluation_status:'evaluated',counterfactual_decision:'deny',findings:['idempotencyKey was already used: PRIVATE-ARGUMENT'],result_class:'transport_unknown',duration_ms:1400};
await writeFile(observation,observationHtml(observationReport([event])));
execFileSync(process.execPath,['--experimental-strip-types',new URL('../examples/recovery-walkthrough.mts',import.meta.url).pathname,'--html',recovery],{stdio:'pipe'});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
  page.on('pageerror',(error:Error)=>errors.push(error.message));
  for(const [file,name] of [[observation,'observation'],[recovery,'recovery']]) {
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.locator('script').count(),0);
    assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE-ARGUMENT'));
    const summary=page.locator('summary').first();await summary.focus();await page.keyboard.press('Enter');
    assert.equal(await summary.evaluate(el=>el.parentElement?.hasAttribute('open')),true);
    await page.screenshot({path:`/tmp/agentaction-${name}-desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`/tmp/agentaction-${name}-mobile.png`,fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
  console.log('Diagnostics browser acceptance passed: safe local reports, desktop/mobile layout, keyboard evidence disclosure and no scripts or raw argument values.');
} finally {await browser.close();await rm(directory,{recursive:true,force:true});}
