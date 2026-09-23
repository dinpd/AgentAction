import assert from 'node:assert/strict';
import test from 'node:test';
import {mcpMatching} from '../src/mcp-matching.ts';
test('social research ranks capability fit without connected or suggested boosts',()=>{
 const matcher=mcpMatching(),candidates=[
  {id:'notion',title:'Notion',description:'Search and fetch workspace pages',connected:true},
  {id:'social',title:'Social post search',description:'Search public social media posts with source links and timestamps',connected:false},
  {id:'web',title:'Web search',description:'Search web pages including indexed social posts',connected:true},
 ];
 const ranked=matcher.rank('Search public social media posts',candidates);
 assert.equal(ranked[0].id,'social');assert.ok(!ranked.some(c=>c.id==='notion'));
 assert.deepEqual(matcher.rank('Search public social media posts',candidates.map(c=>({...c,connected:!c.connected}))).map(c=>c.id),ranked.map(c=>c.id));
});
