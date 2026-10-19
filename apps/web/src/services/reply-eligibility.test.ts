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
