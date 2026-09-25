import { boundedText, object, RuntimeError, textField, type McpTool } from './mcp-client.ts';
import { emailAddress } from './notifications.ts';

export const RESEARCH_ACTORS = { reddit: 'harshmaur/reddit-scraper', x: 'kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest' } as const;
export const RESEARCH_ENDPOINT = `https://mcp.apify.com/?tools=call-actor,${RESEARCH_ACTORS.reddit},${RESEARCH_ACTORS.x}`;
export const RESEARCH_TOOLS = ['call-actor', 'get-actor-run', 'get-dataset-items'];
export type Platform = keyof typeof RESEARCH_ACTORS;
export type ResearchConfig = { connectionId: string; topics: string; queries: Record<Platform,string[]>; recipient: string; time: string; timezone: string; maxItems: number; actorCapUsd: number; rollingCapUsd: number; freePlan: true };
export type ResearchDefinition = { config: ResearchConfig; tools: McpTool[]; pricing?: Record<Platform,string>; digest: string; approved?: { actor: string; at: string; digest: string } };
export type Post = { platform: Platform; url: string; at: string; text: string; reason?: string };
export type SourceProgress = { platform: Platform; stage: 'ready'|'starting'|'waiting'|'reading'|'done'|'unavailable'; runId?: string; datasetId?: string; usageUsd?: number; polls: number; received: number; invalid: number; outsideWindow: number; duplicates: number; total?: number; gap?: string; posts: Post[] };
export type ResearchRun = { definition: ResearchDefinition; approval?: { id: string; actor: string; at: string }; sources: SourceProgress[]; due?: number; deadline: number; report?: string; checks?: { label: string; status: 'pass'|'fail'; observed: string; method: string }[]; delivery?: { status: string; id?: string; error?: string }; deliveryAttempts?: number; reserved?: boolean };
const day = 86400000;
function retainedText(value:string):string {
  let text=value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').trim().slice(0,1000);
  while(new TextEncoder().encode(JSON.stringify(text)).length>1100)text=text.slice(0,Math.floor(text.length*0.8));
  return text;
}
export function researchConfig(raw: unknown): ResearchConfig {
  const v=object(raw), queries=object(v.queries);
  const lines=(raw:unknown):string[]=>{
    if(!Array.isArray(raw)||raw.length<1||raw.length>5)throw new RuntimeError('Review one to five search phrases for each platform.');
    return [...new Set(raw.map(s=>textField(s,'search phrase',100)))];
  };
  const timezone=textField(v.timezone,'timezone',80);
  try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(); } catch { throw new RuntimeError('Use an IANA timezone such as America/Los_Angeles.'); }
  if(typeof v.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))throw new RuntimeError('Choose a delivery time in HH:MM format.');
  if(!Number.isInteger(v.maxItems)||Number(v.maxItems)<5||Number(v.maxItems)>20)throw new RuntimeError('Retrieve 5–20 posts per platform.');
  if(typeof v.actorCapUsd!=='number'||!Number.isFinite(v.actorCapUsd)||v.actorCapUsd<0.01||v.actorCapUsd>0.05)throw new RuntimeError('The free-plan workflow permits $0.01–$0.05 per Actor start.');
  if(typeof v.rollingCapUsd!=='number'||!Number.isFinite(v.rollingCapUsd)||v.rollingCapUsd<2*v.actorCapUsd||v.rollingCapUsd>4)throw new RuntimeError('Choose a rolling 31-day reservation limit up to $4.');
  if(v.freePlan!==true)throw new RuntimeError('Confirm the Apify account remains on its existing Free plan. No upgrade or overage is authorized.');
  return {connectionId:textField(v.connectionId,'Apify connection',80),topics:textField(v.topics,'relevance scope',2000),queries:{reddit:lines(queries.reddit),x:lines(queries.x)},recipient:emailAddress(v.recipient),time:v.time,timezone,maxItems:Number(v.maxItems),actorCapUsd:v.actorCapUsd,rollingCapUsd:v.rollingCapUsd,freePlan:true};
}
/** First matching wall-clock minute strictly after now. A skipped DST minute uses the next valid local minute; a repeated minute runs once. */
export function nextResearchTime(config: Pick<ResearchConfig,'time'|'timezone'>, after: number): number {
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts=(t:number)=>Object.fromEntries(fmt.formatToParts(t).map(p=>[p.type,p.value]));
  const local=parts(after), key=(p:Record<string,string>)=>`${p.year}-${p.month}-${p.day}`;
  const today=key(local), current=`${local.hour}:${local.minute}`;
  for(let t=Math.floor(after/60000)*60000+60000;t<=after+49*3600000;t+=60000){
    const p=parts(t), date=key(p), time=`${p.hour}:${p.minute}`;
    if(time>=config.time && (date!==today||current<config.time)) return t;
  }
  throw new RuntimeError('Unable to resolve the next local schedule.');
}
export function actorArguments(config: ResearchConfig, platform: Platform, startedAt: string) {
  const end=Math.floor(Date.parse(startedAt)/1000), start=end-86400;
  // Only plain search phrases are accepted; operators cannot override time, author or URL scope through query syntax.
  const phrases=config.queries[platform].map(q=>'"'+q.replace(/["\\\r\n]/g,' ')+'"');
  const input=platform==='x'?{twitterContent:`(${phrases.join(' OR ')}) since_time:${start} until_time:${end}`,queryType:'Latest',maxItems:Math.max(20,config.maxItems)}:{searchTerms:[phrases.join(' OR ')],searchTime:'day',searchSort:'new',maxPostsCount:config.maxItems,searchPosts:true,searchComments:false,searchCommunities:false,crawlCommentsPerPost:false,aiAnalysis:false};
  return {actor:RESEARCH_ACTORS[platform],input,waitSecs:0,callOptions:{memory:1024,timeout:180,maxItems:config.maxItems,maxTotalChargeUsd:config.actorCapUsd}};
}
export function toolPayload(result: Record<string,unknown>): Record<string,unknown> {
  if(result.structuredContent&&typeof result.structuredContent==='object'&&!Array.isArray(result.structuredContent))return result.structuredContent as Record<string,unknown>;
  for(const c of Array.isArray(result.content)?result.content:[]){try {const p=JSON.parse(String(object(c).text));if(p&&typeof p==='object'&&!Array.isArray(p))return p;}catch{}}
  throw new RuntimeError('The provider returned no structured result. Coverage is unavailable.');
}
export function actorEvidence(payload:Record<string,unknown>):{runId:string;datasetId?:string;status:string} {
  const validId=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9]{8,40}$/.test(s);
  if(!validId(payload.runId)||typeof payload.status!=='string')throw new RuntimeError('The Actor did not return a verifiable run identifier and status.');
  const storages=object(payload.storages||{}), datasets=object(storages.datasets||{});
  const entry=datasets.default;
  const datasetId=typeof entry==='string'?entry:entry&&typeof entry==='object'?(entry as Record<string,unknown>).id:payload.defaultDatasetId;
  return {runId:payload.runId,status:payload.status,...(validId(datasetId)?{datasetId}:{})};
}
export function sourcePosts(source:SourceProgress, payload:Record<string,unknown>, startedAt:string, maxItems:number):void {
  if(payload.datasetId!==source.datasetId||!Array.isArray(payload.items))throw new RuntimeError('Dataset rows do not match this run. Coverage is unavailable.');
  const end=Date.parse(startedAt), seen=new Set<string>(); source.posts=[];
  source.received=Math.min(payload.items.length,maxItems);source.total=typeof payload.totalItemCount==='number'?payload.totalItemCount:undefined;
  for(const raw of payload.items.slice(0,maxItems)){
    if(!raw||typeof raw!=='object'){source.invalid++;continue;}
    const p=raw as Record<string,unknown>;
    let url:URL;
    try {url=new URL(String(p.postUrl||p.permalink||p.twitterUrl||p.url),source.platform==='reddit'?'https://www.reddit.com':undefined);}catch{source.invalid++;continue;}
    const host=url.hostname.replace(/^www\./,'');
    const valid=source.platform==='x'?['x.com','twitter.com'].includes(host)&&/^\/[^/]+\/status\/\d+/.test(url.pathname):host==='reddit.com'&&/\/comments\/[a-z0-9]+/i.test(url.pathname);
    const text=retainedText([p.title,p.text||p.body||p.selftext].filter(v=>typeof v==='string').join('\n'));
    const date=p.createdAt||p.createdUtc||p.created_utc||p.created||p.timestamp;
    const at=typeof date==='number'?date*(date<1e12?1000:1):Date.parse(String(date));
    if(!valid||url.href.length>500||url.protocol!=='https:'||url.username||url.password||!text||!Number.isFinite(at)){source.invalid++;continue;}
    if(at<end-day||at>end+60000){source.outsideWindow++;continue;}
    url.search='';url.hash='';url.hostname=source.platform==='x'?'x.com':'www.reddit.com';
    const normalized=url.href.replace(/\/$/,'');
    const identity=source.platform+':'+(source.platform==='x'?url.pathname.match(/\/status\/(\d+)/)![1]:url.pathname.match(/\/comments\/([a-z0-9]+)/i)![1]);
    if(seen.has(identity)){source.duplicates++;continue;}seen.add(identity);
    source.posts.push({platform:source.platform,url:normalized,at:new Date(at).toISOString(),text});
  }
  if(source.total===undefined)source.gap='Provider did not report dataset size; completeness is unknown.';
  else if(source.total>source.received)source.gap=`Sample limited to ${source.received} of ${source.total} dataset rows.`;
  if(source.invalid)source.gap=[source.gap,`${source.invalid} rows lacked usable post evidence.`].filter(Boolean).join(' ');
  source.stage='done';
}
export function reportChecks(run:ResearchRun, classified:boolean) {
  const done=run.sources.filter(s=>s.stage==='done').length, invalid=run.sources.reduce((n,s)=>n+s.invalid,0);
  return [
    {label:'Both platforms retrieved',status:done===2?'pass':'fail',observed:`${done}/2 platforms`,method:'Require terminal SUCCEEDED Actor runs and a matching dataset response for X and Reddit.'},
    {label:'Actor charges within cap',status:run.sources.every(s=>s.usageUsd!==undefined&&s.usageUsd<=run.definition.config.actorCapUsd+0.000001)?'pass':'fail',observed:run.sources.map(s=>`${s.platform}: ${s.usageUsd===undefined?'unverified':'$'+s.usageUsd}`).join('; '),method:'Compare each terminal Actor run’s provider-reported usageTotalUsd with the approved per-Actor cap. Missing charge evidence cannot pass.'},
    {label:'Usable source evidence',status:invalid===0&&done===2?'pass':'fail',observed:`${invalid} invalid rows`,method:'Validate platform post URLs, text and timestamps; missing fields remain a coverage gap.'},
    {label:'Relevance and grounding',status:classified?'pass':'fail',observed:classified?'Every candidate classified; retained posts cite their observed URL and reason.':'Classification unavailable or incomplete.',method:'AI classifies every in-window candidate against the reviewed scope. Server accepts only observed post indices and nonempty reasons; this is not a human precision score.'},
    {label:'Window and deduplication',status:'pass',observed:`${run.sources.reduce((n,s)=>n+s.outsideWindow,0)} outside-window and ${run.sources.reduce((n,s)=>n+s.duplicates,0)} duplicate rows excluded`,method:'Retain only unique canonical post URLs with timestamps in the 24 hours ending at scan start.'},
  ] as NonNullable<ResearchRun['checks']>;
}
export function reportText(research:ResearchRun, startedAt:string):string {
  const c=research.definition.config, selected=research.sources.flatMap(s=>s.posts.filter(p=>p.reason));
  return [`Daily social research`, `Scope: ${c.topics}`,`Window: ${new Date(Date.parse(startedAt)-day).toISOString()} — ${startedAt}`,'',
    ...research.sources.map(s=>`${s.platform==='x'?'X':'Reddit'}: ${s.stage==='done'?`${s.received} rows retrieved; ${s.posts.filter(p=>p.reason).length} relevant posts`:`UNAVAILABLE — ${s.gap||'Search could not be verified'}`}${s.stage==='done'&&s.gap?`; ${s.gap}`:''}`),
    'Coverage is a bounded sample, not an exhaustive search of either platform. A zero does not prove no relevant conversation exists.','',
    ...(selected.length?selected.slice(0,12).flatMap((p,i)=>[`${i+1}. ${p.platform.toUpperCase()} · ${p.at}`,p.url,p.text.slice(0,500),`Why relevant: ${p.reason}`,'']):['No relevant posts retained in the available evidence. Review source coverage and checks below.','']),
    ...(selected.length>12?[`${selected.length-12} additional relevant posts are retained in the console.`]:[]),
    'Validation',...(research.checks||[]).map(c=>`${c.status.toUpperCase()} · ${c.label}: ${c.observed}\nMeasured by: ${c.method}`),'',
    `Billing controls: at most two Actor starts, $${c.actorCapUsd.toFixed(2)} billed cap per Actor, $${c.rollingCapUsd.toFixed(2)} reserved per rolling 31 days. Shared Apify Free allowance also applies; dataset/API infrastructure usage is governed by the provider allowance. No upgrade or overage authorized.`
  ].join('\n').slice(0,16000);
}

/** Public metadata only: never send the connected token to the API or follow redirects. */
export async function researchPricing(platform:Platform, cap:number, fetcher:typeof fetch=fetch):Promise<string>{
  const response=await fetcher(`https://api.apify.com/v2/acts/${RESEARCH_ACTORS[platform].replace('/','~')}`,{redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new RuntimeError('Could not verify current Actor billing. No Actor was started.',409);
  const data=object(object(JSON.parse(await boundedText(response,128000))).data);
  const prices=(Array.isArray(data.pricingInfos)?data.pricingInfos:[]).map(object).filter(p=>Date.parse(String(p.startedAt))<=Date.now()).sort((a,b)=>Date.parse(String(b.startedAt))-Date.parse(String(a.startedAt)));
  const price=prices[0];
  if(!price||price.pricingModel!=='PAY_PER_EVENT'||Number(price.minimalMaxTotalChargeUsd||0)>cap)throw new RuntimeError('The Actor billing model or minimum charge no longer supports the reviewed cap. Review another configuration.',409);
  const events=object(object(price.pricingPerEvent||{}).actorChargeEvents||{});
  const descriptions=Object.values(events).map(object).map(e=>{
    const amount=e.eventPriceUsd??object(object(e.eventTieredPricingUsd||{}).FREE||{}).tieredEventPriceUsd;
    if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>cap)throw new RuntimeError('Actor event price is unavailable or exceeds the reviewed cap.',409);
    return `${String(e.eventTitle).slice(0,80)}: $${amount}`;
  });
  if(!descriptions.length)throw new RuntimeError('Actor billing events are unavailable.',409);
  return descriptions.join('; ');
}
