import {expect, test} from 'vitest';
import {replyEligibility} from './reply-eligibility.js';

const reply={session_id:'s',thread_id:'a',epoch:2};
const facts={sessionId:'s',threadId:'a',focused:true,epoch:2,openTurns:new Set<string>(),output:'on'};

test('same epoch plays in FIFO admission; typing has no effect on eligibility',()=>{
 expect(replyEligibility(reply,facts)).toBe('play');
 expect(replyEligibility(reply,{...facts})).toBe('play');
 expect(replyEligibility({...reply,epoch:1,requested:true},facts)).toBe('play');
});
test.each([
 ['session', {...facts,sessionId:'other'},'call_ended'],
 ['focus', {...facts,threadId:'b'},'focus_changed'],
 ['not in focus', {...facts,focused:false},'focus_changed'],
 ['mute', {...facts,output:'agents_muted'},'agents_muted'],
 ['voice off', {...facts,output:'voice_off'},'voice_off'],
 ['new turn', {...facts,epoch:3},'newer_turn'],
 ['turn open', {...facts,openTurns:new Set(['t'])},'hold'],
 ['epoch unknown', {...facts,epoch:null},'hold'],
] as const)('%s has the correct playback decision',(_name,input,decision)=>{
 expect(replyEligibility(reply,input)).toBe(decision);
});
test('a reply sent to an earlier session of the same call plays whatever its epoch says; one of another call never does',()=>{
 const earlier={...reply,session_id:'old',epoch:7};
 const mine={...facts,sessionId:'new',earlierSessions:new Set(['old','new']),epoch:null};
 expect(replyEligibility(earlier,mine)).toBe('play');
 expect(replyEligibility(earlier,{...mine,openTurns:new Set(['t'])})).toBe('hold');
 expect(replyEligibility(earlier,{...mine,output:'voice_off'})).toBe('voice_off');
 expect(replyEligibility(earlier,{...mine,earlierSessions:new Set(['new'])})).toBe('call_ended');
 expect(replyEligibility(earlier,{...mine,earlierSessions:undefined})).toBe('call_ended');
});
