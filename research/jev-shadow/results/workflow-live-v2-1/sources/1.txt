import {createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
// Research-only approval state machine. Secret is fresh per workflow, never
// serialized. It represents a scripted approver, not production authentication.
export function actionHash(action,version){return createHash("sha256").update(JSON.stringify({version,action})).digest("hex");}
export function createLedger(controls){
 const secret=randomBytes(32),executed=new Set(),events=[];let approval=null;
 const sign=body=>createHmac("sha256",secret).update(JSON.stringify(body)).digest("hex");
 return {events,
  approve(action){const body={binding:actionHash(action,controls.policy_version),expires:200,approver:"scripted-supervisor",revoked:false};approval={body,signature:sign(body)};events.push({event:"scripted_approval",binding:body.binding});},
  check(action,patch={}){
   let decision="allow",reason="controls_pass";
   if(action.tenant!==controls.tenant||!controls.allowed_operations.includes(action.operation)||!controls.allowed_destinations.includes(action.destination)||action.fields.some(f=>!controls.allowed_fields.includes(f))||!Number.isSafeInteger(action.amount_cents)||action.amount_cents<0||action.amount_cents>controls.amount_limit_cents||action.currency!=="USD"){decision="deny";reason="hard_policy";}
   else if(executed.has(action.idempotency_key)){decision="deny";reason="already_executed";}
   else if(controls.approval_required){
    if(!approval){decision="challenge_required";reason="approval_missing";}
    else {const body={...approval.body};if(patch.tampered)body.approver="attacker";const expected=Buffer.from(sign(body)),actual=Buffer.from(approval.signature);const valid=expected.length===actual.length&&timingSafeEqual(expected,actual);
     if(!valid){decision="challenge_required";reason="invalid_signature";}
     else if(body.binding!==actionHash(action,controls.policy_version)){decision="challenge_required";reason="action_changed";}
     else if(patch.expired||body.expires<=100){decision="challenge_required";reason="approval_expired";}
     else if(patch.revoked||body.revoked){decision="challenge_required";reason="approval_revoked";}
    }
   }
   return {decision,reason};
  },
  execute(action){if(executed.has(action.idempotency_key))throw Error("duplicate simulated execution");executed.add(action.idempotency_key);events.push({event:"simulated_execution",binding:actionHash(action,controls.policy_version),idempotency_key:action.idempotency_key});}
 };
}
export function compose(gateway,control,semantic){if([gateway,control].includes("deny"))return "deny";if([gateway,control].includes("challenge_required"))return "challenge_required";return semantic;}
