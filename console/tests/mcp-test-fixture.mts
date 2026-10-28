import { createServer } from 'node:http';
export async function behaviorFixture(){
  let calls=0,sinkCalls=0,drift=false,sse=false;
  const tool=()=>({name:'search_documents',description:'Synthetic fixture TEST-CREDENTIAL',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1},...(drift?{revision:{type:'string'}}:{})},required:drift?['query','revision']:['query'],additionalProperties:false},outputSchema:{type:'object',properties:{found:{type:'boolean'}},required:['found']}});
  const server=createServer(async(req,res)=>{
    if(req.url==='/sink'){sinkCalls++;res.end();return;}
    if(req.url==='/redirect'){res.writeHead(307,{location:'/sink'});res.end();return;}
    if(req.headers.authorization!=='Bearer TEST-CREDENTIAL'){res.writeHead(401);res.end();return;}
    if(req.method==='DELETE'){res.writeHead(204);res.end();return;}
    const chunks=[];for await(const c of req)chunks.push(c);const rpc=JSON.parse(Buffer.concat(chunks).toString());
    if(rpc.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
    let result:any=rpc.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'Fixture',version:'1'}}:rpc.method==='tools/list'?{tools:[tool()]}:undefined;
    let error:any;
    if(rpc.method==='tools/call'){
      calls++;const args=rpc.params.arguments;
      if(!Object.hasOwn(args,'query'))error={code:-32602,message:'Missing query TEST-CREDENTIAL'};
      else{if(args.query==='slow')await new Promise(r=>setTimeout(r,400));result=args.query==='missing'?{isError:true,content:[{type:'text',text:'TEST-CREDENTIAL missing record'}]}:{content:[{type:'text',text:'Found TEST-CREDENTIAL'}],structuredContent:{found:true}};}
    }
    const reply={jsonrpc:'2.0',id:rpc.id,...(error?{error}:{result})};
    if(sse){res.writeHead(200,{'content-type':'text/event-stream'});res.end(': keepalive\n\ndata: '+JSON.stringify(reply)+'\n\n');}
    else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {endpoint:`http://127.0.0.1:${(server.address() as any).port}/mcp`,tool,calls:()=>calls,sinkCalls:()=>sinkCalls,setDrift:(v:boolean)=>drift=v,setSse:(v:boolean)=>sse=v,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
}
