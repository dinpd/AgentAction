import { open } from 'node:fs/promises';
import { readinessComparison } from '../src/readiness-comparison.ts';

const args=process.argv.slice(2),json=args.includes('--json');
try {
  const files=args.filter(a=>a!=='--json');
  if(files.length!==2||files.some(a=>a.startsWith('-'))) throw new Error('Usage: npm run readiness:compare -- baseline.json current.json [--json]');
  const {parse,compare}=readinessComparison();
  const read=async(path:string)=>{
    const file=await open(path,'r');
    try {
      if(!(await file.stat()).isFile()) throw new Error('Choose regular report files.');
      const buffer=Buffer.alloc(512*1024+1);let size=0;
      while(size<buffer.length) {const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
      if(size>512*1024) throw new Error('Choose a readiness JSON export smaller than 512 KiB.');
      return parse(buffer.subarray(0,size).toString('utf8'));
    } finally {await file.close();}
  };
  const result=await compare(await read(files[0]),await read(files[1]));
  console.log(json?JSON.stringify(result,null,2):[
    'What changed',result.reason,
    ...(result.baselineAt?[`Baseline: ${result.baselineAt}`,`Current: ${result.currentAt}`]:[]),
    ...result.changes.map(c=>`- ${c.tool}: ${c.kind}`),
    'Metadata comparison only; no network requests or tool execution. This is not a compatibility or safety certificate.',
  ].join('\n'));
  process.exitCode=result.status==='unavailable'?2:result.status==='changed'?1:0;
} catch(error) {
  const message=(error as NodeJS.ErrnoException).code?'Unable to read report files. Check their paths and permissions.':error instanceof Error?error.message:'Comparison unavailable.';
  if(json)console.log(JSON.stringify({status:'unavailable',changes:[],reason:message}));else console.error(message);
  process.exitCode=2;
}
