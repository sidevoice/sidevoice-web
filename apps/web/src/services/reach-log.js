/* Why a machine cannot be reached, as a line in the host's log (a machine that cannot be located used to leave no trace:
 * every machine "Offline" and nothing said why). Same road as call-end.js: `console.warn`, which the app's log forwarder
 * writes with every string as `[string]` and lets only a dotted code through. So the reason travels as the `code` of an
 * object (`app.reach.http_status`), a status as a number, a thrown error as its `name`; the host of each address tried
 * goes along as a string (shown by a browser console, `[string]` in the app's log). Never a token, a secret, a nonce, a
 * path or a message: a reason outside the list is `unknown`, never free text. Nothing here decides anything. */

/** Why one address did not prove it is the machine. A new one is added here, and nowhere else. */
export const REACH_WHY=Object.freeze(['fetch_failed','timeout','http_status','bad_json','missing_fields','fingerprint_mismatch','bad_signature','error']);

/** The host of an address, and nothing else of it: a path or a query may name a node or carry a nonce. */
export function hostOf(base){
 if(typeof base!=='string'||!/^https?:\/\//.test(base))return 'same-origin';
 try{return new URL(base).host}catch{return 'invalid'}
}

/**
 * One address's outcome, as the log keeps it.
 * @param {{base:string}} candidate
 * @param {{ok:boolean,reason?:string,why?:string,status?:number,errorName?:string}} proof
 */
export function reachOutcome(candidate,proof){
 const why=REACH_WHY.includes(proof?.why)?proof.why:proof?.reason==='error'?'error':'unknown';
 return {host:hostOf(candidate?.base),why,...(why==='http_status'&&Number.isInteger(proof.status)?{status:proof.status}:{}),
  ...(why==='fetch_failed'&&typeof proof.errorName==='string'?{errorName:proof.errorName}:{})};
}

const signature=outcomes=>outcomes.map(o=>o.host+' '+o.why+' '+(o.status??'')+' '+(o.errorName??'')).join('|')||'none';
const codeOf=why=>'app.reach.'+(REACH_WHY.includes(why)?why:'unknown');
function lineOf(message,head,outcomes,warn){
 const items=[];
 for(const outcome of outcomes){
  items.push(outcome.host,{code:codeOf(outcome.why)});
  if(outcome.status!=null)items.push(outcome.status);
  if(outcome.errorName)items.push({name:/^[A-Za-z]{1,40}(Error|Exception)$/.test(outcome.errorName)?outcome.errorName:'UnknownError'});
 }
 try{warn(message,{code:head},...items)}catch{/* the log never reaches a machine or fails a pairing */}
}

/**
 * The reach log: one WARN line when a machine cannot be located, with each address tried and why it failed, written when
 * that picture changes and not on every beat; one more when a failed pairing is told.
 * @param {(...args: unknown[]) => void} [warn]
 */
export function createReachLog(warn=(...args)=>console.warn(...args)){
 const told=new Map();
 return {
  /** @param {string} fp @param {ReturnType<typeof reachOutcome>[]} outcomes @param {boolean} [searchFailed] the search itself threw */
  located(fp,outcomes,searchFailed=false){
   const list=searchFailed?[...outcomes,{host:'search',why:'error'}]:outcomes,sign=signature(list);
   if(told.get(fp)===sign)return;
   told.set(fp,sign);
   lineOf('A machine could not be located.',list.length?'app.reach.locate_failed':'app.reach.no_candidates',list,warn);
  },
  /** The machine answered: its next failure is news again. */
  recovered(fp){told.delete(fp)},
  /** A pairing attempt that failed: which addresses were tried, and the code it failed with. */
  pairing(outcomes,error){
   const code=typeof error?.code==='string'&&/^[a-z0-9_-]{1,32}$/.test(error.code)?error.code.replace(/-/g,'_'):'other';
   lineOf('A pairing attempt failed.','app.pairing.failed.'+code,outcomes,warn);
  },
 };
}
