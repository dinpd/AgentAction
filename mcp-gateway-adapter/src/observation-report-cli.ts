import { open, writeFile } from 'node:fs/promises';
import { observationReport, observationText, observationHtml } from './observation-report.js';

try {
  const [input,...flags]=process.argv.slice(2);
  if(!input||input.startsWith('-')||!(flags.length===0||(flags.length===1&&flags[0]==='--json')||(flags.length===2&&flags[0]==='--html'&&!flags[1].startsWith('-')))) throw new Error('Usage: npm run observe:report -- observations.jsonl [--json | --html report.html]');
  const file=await open(input,'r');let text:string;
  try {
    if(!(await file.stat()).isFile())throw new Error('Choose a regular JSONL log file.');
    const buffer=Buffer.alloc(2*1024*1024+1);let size=0;
    while(size<buffer.length){const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
    if(size>2*1024*1024)throw new Error('Use a log segment smaller than 2 MiB.');
    text=buffer.subarray(0,size).toString('utf8');
  } finally {await file.close();}
  const entries=text.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}});
  const report=observationReport(entries);
  if(flags[0]==='--html') {await writeFile(flags[1],observationHtml(report),{flag:'wx'});console.log('Created observation report. Review coverage and visible tool names before sharing.');}
  else console.log(flags[0]==='--json'?JSON.stringify(report,null,2):observationText(report));
} catch(error) {
  console.error((error as NodeJS.ErrnoException).code?'Unable to read logs or create a new report. Check paths and choose a new output file.':error instanceof Error?error.message:'Report unavailable.');process.exitCode=2;
}
