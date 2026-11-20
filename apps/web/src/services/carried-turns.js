/* What the person said to a call while no page heard it. The app keeps the turns the voice finished after the page that held
 * the call went (a reload, or the system ending the web view), and hands them to the page that joins the call again
 * (sidevoice-desktop's `rejoin` command). Each is a turn the voice finished with words; the page says it to the room as it says
 * any turn of the call: a start and an end, the end carrying the words. Anything that is not a turn with words is dropped, and
 * a turn is never invented: no text, no turn. */

/**
 * The voice events of the turns the app carried over, oldest first: for each, its start and its end.
 * @param {unknown} turns what the app handed over
 * @param {() => number} [now] the clock, for a turn that came without times
 * @returns {Array<[{phase:'started',turn_id:string,started_at:number},{phase:'finished',turn_id:string,text:string,language?:string,started_at:number,ended_at:number,merged:false}]>}
 */
export function carriedTurnEvents(turns,now=Date.now){
 if(!Array.isArray(turns))return [];
 const seen=new Set(),events=[];
 for(const turn of turns){
  if(!turn||typeof turn!=='object')continue;
  const {turn_id,text,language,started_at,ended_at}=turn;
  if(typeof turn_id!=='string'||!turn_id||seen.has(turn_id)||typeof text!=='string'||!text.trim())continue;
  seen.add(turn_id);
  const started=Number.isFinite(started_at)?started_at:now();
  const ended=Number.isFinite(ended_at)?ended_at:started;
  events.push([{phase:'started',turn_id,started_at:started},
   {phase:'finished',turn_id,text,...(typeof language==='string'&&language?{language}:{}),started_at:started,ended_at:ended,merged:false}]);
 }
 return events;
}
