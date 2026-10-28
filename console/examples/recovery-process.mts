/** Synthetic subprocess fixture. No production route, credentials or payment API. */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { actionDigest, supervisorRecord, DEFAULT_SUPERVISOR_LIMITS, proposeAction, claimAction, recoverActions, reconcileAction, type SupervisorRecord } from '../src/execution-supervisor.ts';

const [directory,phase]=process.argv.slice(2);
const supervisor=new DatabaseSync(join(directory,'supervisor.sqlite'));
const provider=new DatabaseSync(join(directory,'provider.sqlite'));
supervisor.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
provider.exec('CREATE TABLE IF NOT EXISTS refunds (request_digest TEXT PRIMARY KEY, result TEXT NOT NULL)');
const request={paymentId:'synthetic-payment',amount:49,currency:'USD',idempotencyKey:'synthetic-case-1042'};
type RecordState={supervisor:SupervisorRecord;result?:Record<string,unknown>};
const save=(state:RecordState)=>supervisor.prepare('INSERT OR REPLACE INTO state VALUES (1, ?)').run(JSON.stringify(state));
const load=()=>JSON.parse(String(supervisor.prepare('SELECT value FROM state WHERE id=1').get()?.value)) as RecordState;
const effects=()=>Number(provider.prepare('SELECT count(*) AS count FROM refunds').get()!.count);
let state:RecordState,blocked=false;
try {
  if(phase==='prepare') {
    if(supervisor.prepare('SELECT id FROM state WHERE id=1').get())throw new Error('Fixture already prepared');
    const limits={...DEFAULT_SUPERVISOR_LIMITS,maxCalls:1,recoveryPolicy:'reconcile' as const};
    state={supervisor:supervisorRecord({version:0,limits},limits)};
    proposeAction(state.supervisor,'synthetic-approval',await actionDigest(request));save(state);
  } else {
    state=load();const action=state.supervisor.actions[0];
    if(phase==='dispatch'||phase==='retry') {
      supervisor.exec('BEGIN IMMEDIATE');
      try {claimAction(state.supervisor,'synthetic-approval',await actionDigest(request),0,'synthetic-reviewer');save(state);supervisor.exec('COMMIT');}
      catch {supervisor.exec('ROLLBACK');blocked=true;state=load();}
      if(!blocked) {
        const result={refundId:'synthetic-refund-1',paymentId:request.paymentId,amount:request.amount,currency:request.currency};
        // Independent durable provider commit precedes intentional process exit.
        provider.prepare('INSERT INTO refunds VALUES (?, ?)').run(action.bindingDigest,JSON.stringify(result));
        console.log(JSON.stringify({state:action.state,providerEffects:effects(),responseLost:true}));
        supervisor.close();provider.close();process.exit(75);
      }
    } else if(phase==='restart') {recoverActions(state.supervisor);save(state);}
    else if(['reconcile','reconcile-missing','reconcile-mismatch'].includes(phase)) {
      await reconcileAction(state.supervisor,action.id,async frozen=>{
        const row=phase==='reconcile-missing'?undefined:provider.prepare('SELECT request_digest, result FROM refunds WHERE request_digest=?').get(frozen.bindingDigest);
        if(!row||phase==='reconcile-mismatch'||row.request_digest!==frozen.bindingDigest)return 'uncertain';
        const result=JSON.parse(String(row.result));
        if(result.paymentId!==request.paymentId||result.amount!==request.amount||result.currency!==request.currency||result.refundId!=='synthetic-refund-1')return 'uncertain';
        state.result=result;return 'succeeded';
      });save(state);
    } else if(phase!=='replay') throw new Error('Unknown fixture phase');
  }
  console.log(JSON.stringify({state:state.supervisor.actions[0].state,providerEffects:effects(),blocked,...(state.result?{originalResult:state.result}:{}),journal:state.supervisor.journal.map(e=>({state:e.state,reason:e.reason}))}));
} finally {supervisor.close();provider.close();}
