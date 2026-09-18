import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
let connected=false, expired=false, newUser=false; const posts:any[]=[];
const state=(tenant:string)=>({connections:connected&&tenant==='acme'?[{id:'firecrawl',status:'connected',label:'My Firecrawl',endpoint:'https://mcp.firecrawl.dev/v2/mcp',tools:[{name:'firecrawl_scrape'}],suggestions:[]}]:[],agents:posts.some(p=>p.path.endsWith('/create'))?[{id:'a',title:'Pricing draft',status:'draft',goal:'Review pricing',success:'Sourced',recipe:{id:'competitor-pricing',version:'1.0.0'}}]:[],runs:[],endpointAccess:{deployment:['https://mcp.firecrawl.dev/v2/mcp'],workspace:[]},inspections:[]});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');
 if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 let value:any={};
 if(expired){res.statusCode=401;value={error:'Expired'};}
 else if(req.method==='POST'){
  let text='';for await(const chunk of req)text+=chunk;posts.push({path:url.pathname,body:JSON.parse(text)});
  if(url.pathname.endsWith('/connect'))connected=true;
  else if(url.pathname.endsWith('/inspect-endpoint')){res.statusCode=503;value={error:'Inspection unavailable in fixture'};}
  else if(!url.pathname.endsWith('/create'))throw new Error('Unexpected mutation '+url.pathname);
 }else if(url.pathname==='/api/console/session')value={tenant_id:newUser?'':'acme',email:'owner@example.com',workspace_mode:'directory',memberships:newUser?[]:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:'owner'}}))};
 else if(url.pathname.endsWith('/state'))value=state(url.pathname.split('/')[3]);
 else if(url.pathname.endsWith('/catalog'))value={servers:[],total:0,capabilities:[],authTypes:[],status:'ready',nextOffset:null};
 else if(url.pathname.endsWith('/setup'))value={tenant:{tenant_id:'acme'},membership:{role:'owner'},sources:[],members:[],ingestion:{observed:false}};
 res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${(server.address() as any).port}`, path='/agents?recipe=competitor-pricing&recipe_version=1.0.0#create';
try {
 await page.goto(base+path);await page.locator('#recipe-connection').waitFor();assert.equal(posts.length,0);
 assert.equal(await page.getByRole('button',{name:'Configure this recipe',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Connect a missing server',exact:true}).click();
 await page.getByRole('heading',{name:'Connect your tools.',exact:true}).waitFor();
 assert.equal(await page.locator('#precheck-endpoint').inputValue(),'https://mcp.firecrawl.dev/v2/mcp');
 await page.locator('#connect [name=consent]').check();await page.locator('#connect button[type=submit]').click();
 await page.getByRole('heading',{name:'Give your agent a job.',exact:true}).waitFor();await page.locator('#recipe-connection option[value=firecrawl]').waitFor({state:'attached'});
 await page.locator('#recipe-connection').selectOption('firecrawl');await page.locator('#recipe-reviewed').check();await page.getByRole('button',{name:'Configure this recipe',exact:true}).click();
 assert.equal(await page.locator('#create [name=title]').inputValue(),'Track competitor pricing changes');assert.ok((await page.locator('#create [name=success]').inputValue()).length>20);assert.equal(await page.locator('#create [name=setup]').inputValue(),'');
 await page.locator('#create [name=setup]').fill('PRIVATE acme input');await page.locator('#workspace').selectOption('beta');await page.locator('#status').getByText('Workspace ready · owner').waitFor();
 assert.equal(await page.locator('#configure').isHidden(),true);assert.equal(await page.locator('#create [name=setup]').inputValue(),'');assert.equal(await page.locator('#recipe-connection').inputValue(),'');assert.equal(new URL(page.url()).searchParams.get('recipe'),'competitor-pricing');
 await page.locator('#workspace').selectOption('acme');await page.locator('#recipe-connection option[value=firecrawl]').waitFor({state:'attached'});
 await page.locator('[data-utility=settings]').click();await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor();
 await page.getByRole('link',{name:'Continue with this recipe →',exact:true}).click();await page.locator('#recipe-connection').waitFor();assert.equal(await page.locator('#workspace').inputValue(),'acme');
 await page.locator('#recipe-connection').selectOption('firecrawl');await page.locator('#recipe-reviewed').check();await page.getByRole('button',{name:'Configure this recipe',exact:true}).click();
 await page.locator('#create [name=setup]').fill('Read https://example.com/pricing in USD monthly; stop if historical evidence is unavailable.');
 await page.screenshot({path:'/tmp/agentaction-213-create-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Save draft only',exact:true}).click();await page.getByRole('heading',{name:'Put your agent to work.',exact:true}).waitFor();await page.getByRole('button',{name:'Run a trial',exact:true}).waitFor();
 const creates=posts.filter(p=>p.path.endsWith('/create'));assert.equal(creates.length,1);assert.equal(creates[0].body.recipeId,'competitor-pricing');assert.equal(creates[0].body.recipeVersion,'1.0.0');assert.equal(creates[0].body.recipeReviewed,true);assert.equal(creates[0].body.suggestionId,undefined);assert.equal(new URL(page.url()).searchParams.has('recipe'),false);
 await page.goto(base+'/agents?recipe=competitor-pricing&recipe_version=0.0.0#create');await page.locator('#recipe-error').waitFor();assert.equal(await page.locator('#recipe-detail').isHidden(),true);
 await page.goto(base+'/agents?recipe=incident-to-ticket&recipe_version=1.0.0#create');await page.getByText(/This recipe requires multiple MCP servers/).waitFor();assert.equal(await page.getByRole('button',{name:'Configure this recipe',exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});await page.goto(base+path);await page.locator('#recipe-connection').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/agentaction-213-create-mobile.png',fullPage:true});
 expired=true;await page.reload();await page.getByText('Session unavailable',{exact:true}).waitFor();assert.ok((await page.locator('#account-login').getAttribute('href'))!.includes('recipe=competitor-pricing'));expired=false;
 newUser=true;await page.goto(base+path);await page.getByText('Create or join a workspace in Workspace settings to build an agent.',{exact:true}).waitFor();assert.ok((await page.locator('[data-utility=settings]').getAttribute('href'))!.includes('recipe=competitor-pricing'));
 assert.deepEqual(errors,[]);assert.ok(posts.every(p=>['connect','inspect-endpoint','create'].includes(p.path.split('/').pop())));console.log('Recipe browser acceptance passed: recipe-first connection, pinned draft, setup round trip, workspace isolation, expired session, unsupported/stale recipes and mobile.');
}catch(error){console.error({errors,body:await page.locator('body').innerText()});throw error;}finally{await browser.close();server.close();}
