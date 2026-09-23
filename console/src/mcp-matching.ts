/** Bounded, explainable metadata matching. A suggestion is never tool verification.
 * Self-contained so the same logic can be serialized into the browser bundle. */
export function mcpMatching() {
  const stop=new Set('i want to a an the my with for and or can that me help get read find search retrieve fetch query data information history monitor monitoring tool capability server mcp needed report reports first second supplied use from of in on by check track'.split(' '));
  const families=[
    ['license','licensing','licence','licencing'], ['labor','labour','employment','workforce'],
    ['contact','crm','people','enrichment'], ['email','mail','gmail','outlook'],
    ['web','website','scrape','crawl','browser'], ['ticket','issue','helpdesk'],
    ['database','sql','postgres','mysql','sqlite'], ['document','file','pdf','drive'],
    ['calendar','appointment','scheduling'], ['social','twitter','mastodon','bluesky','linkedin','instagram','reddit','youtube','tiktok','facebook'],
  ];
  function groups(query:string) {
    const tokens=[...new Set((query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>2&&!stop.has(t)))].slice(0,8);
    const result:Array<{label:string;terms:string[]}>=[];
    for(const token of tokens) {
      const family=families.find(f=>f.some(t=>token===t || token===t+'s'));
      const terms=family || [token],label=family?.[0] || token;
      // Each term is bound once for filtering and twice for ranking. Leave
      // room for workspace snapshot, filters and pagination under SQLite's cap.
      if(!result.some(g=>g.label===label) && result.reduce((n,g)=>n+g.terms.length,0)+terms.length<=30) result.push({label,terms});
    }
    return result;
  }
  function match(query:string,title:string,description:string) {
    const name=title.toLowerCase(),text=(title+' '+description).toLowerCase();
    const requested=groups(query),matched=requested.filter(g=>g.terms.some(t=>text.includes(t)));
    if(requested.some(g=>g.terms.length>1) && !matched.some(g=>g.terms.length>1)) return {score:0,terms:[]};
    return {score:matched.reduce((n,g)=>n+8+(g.terms.some(t=>name.includes(t))?4:0),0),terms:matched.map(g=>g.label)};
  }
  function rank<T extends {id:string;title:string;description:string}>(query:string,candidates:T[]) {
    return candidates.map(c=>({...c,...match(query,c.title,c.description)})).filter(c=>c.score>0).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
  }
  return {groups,match,rank};
}
export const MATCHING_FACTORY_JS=`(${mcpMatching.toString()})`;
