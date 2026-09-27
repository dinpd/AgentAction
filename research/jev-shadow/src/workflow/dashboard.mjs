import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../.."),run=resolve(process.argv[2]??`${root}/results/workflow-live-v2-1`),port=Number(process.argv[3]??8803);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("invalid port");
createServer((req,res)=>{
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
 if(req.method!=="GET"){res.writeHead(405);res.end();return;}
 if(req.url==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(readFileSync(resolve(root,"workflow-dashboard.html")));return;}
 if(req.url==="/data"){try{const data=JSON.parse(readFileSync(resolve(run,"summary.json"))),corpus=JSON.parse(readFileSync(resolve(run,"corpus.json"))),rows=readFileSync(resolve(run,"raw.jsonl"),"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);res.setHeader("Content-Type","application/json");res.end(JSON.stringify({data,corpus,rows}));}catch{res.writeHead(503);res.end('{"pending":true}');}return;}
 res.writeHead(404);res.end();
}).listen(port,"127.0.0.1",()=>console.log(`Workflow approval dashboard: http://127.0.0.1:${port}/`));
