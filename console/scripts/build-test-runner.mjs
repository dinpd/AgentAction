import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(root+'generated',{recursive:true});
const notices=await readFile(root+'THIRD-PARTY-NOTICES.txt','utf8');
const license=await readFile(root+'../LICENSE','utf8');
const banner='/*! AgentAction MCP tester · https://github.com/dinpd/AgentAction\n'+license+'\n'+notices+'\n*/';
const browser=await build({entryPoints:[root+'src/mcp-test-ui.ts'],bundle:true,platform:'browser',format:'iife',target:'es2022',write:false,minify:true,banner:{js:banner}});
await writeFile(root+'generated/test-ui.txt',browser.outputFiles[0].text);
const runner=await build({entryPoints:[root+'src/mcp-test-runner.ts'],bundle:true,platform:'node',format:'esm',target:'node22',loader:{'.txt':'text'},write:false,banner:{js:banner}});
await writeFile(root+'generated/test-runner.txt',runner.outputFiles[0].text);
await writeFile(root+'generated/agentaction-mcp-tester.mjs',runner.outputFiles[0].text);

await writeFile(root+'generated/test-assets.ts',`export const TEST_UI=${JSON.stringify(browser.outputFiles[0].text)};\nexport const TEST_RUNNER=${JSON.stringify(runner.outputFiles[0].text)};\n`);
