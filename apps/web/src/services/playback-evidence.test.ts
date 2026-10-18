import {expect, test} from 'vitest';
import {createPlaybackEvidence} from './playback-evidence.js';

const reply = (utterance_id: string, text = 'ask', attempt_id = utterance_id) =>
  ({thread_id: 'room', utterance_id, text, attempt_id});

test('the onset copy keeps publication holes and later admission cannot rewrite it', () => {
  const evidence = createPlaybackEvidence();
  const a = reply('A', 'Approve X?');
  const b = reply('B', 'Approve Y?');
  const c = reply('C', 'Next?');
  evidence.publication(a); evidence.playing(a); evidence.complete(a);
  evidence.publication(b);
  evidence.publication(c); evidence.playing(c); evidence.progress(c, 2);
  const cutoff = evidence.cutoff('room');
  expect(cutoff.snapshot).toEqual({knowledge: 'known', last_played: {utterance_id: 'C', hearing: 'partial', heard_chars: 2},
    recent: [
      {utterance_id: 'A', hearing: 'complete', heard_chars: 10},
      {utterance_id: 'B', hearing: 'not_played', heard_chars: 0},
      {utterance_id: 'C', hearing: 'partial', heard_chars: 2},
    ], truncated: false});
  evidence.publication({thread_id: 'room', utterance_id: 'D', attempt_id: 'D1'});
  evidence.publication({thread_id: 'room', utterance_id: 'A', attempt_id: 'A-replay'});
  evidence.progress(c, 5);
  expect(cutoff.snapshot.recent[2].heard_chars).toBe(2);
  expect(evidence.certifiedAbsence('room', cutoff)).toEqual({not_played_at_turn_start: [
    {utterance_id: 'B', hearing: 'not_played', heard_chars: 0},
    {utterance_id: 'D', hearing: 'not_played', heard_chars: 0},
  ]});
});

test('playing without a completed chunk is unknown, not confirmed silence', () => {
  const evidence = createPlaybackEvidence();
  const a = reply('A', '🐙 hello');
  evidence.publication(a); evidence.playing(a);
  const cutoff = evidence.cutoff('room');
  expect(cutoff.snapshot).toMatchObject({last_played: {utterance_id: 'A', hearing: 'unknown', heard_chars: null},
    recent: [{utterance_id: 'A', hearing: 'unknown', heard_chars: null}]});
  expect(evidence.certifiedAbsence('room', cutoff)).toEqual({not_played_at_turn_start: []});
  evidence.progress(a, 1);
  expect(cutoff.snapshot.recent[0].heard_chars).toBeNull();
  expect(evidence.cutoff('room').snapshot.recent[0]).toEqual({utterance_id: 'A', hearing: 'partial', heard_chars: 1});
});

test('bounded snapshot and absence list preserve older local evidence', () => {
  const evidence = createPlaybackEvidence();
  for (let i = 0; i < 10; i++) evidence.publication(reply(String(i)));
  const cutoff = evidence.cutoff('room');
  expect(cutoff.snapshot.recent.map(row => row.utterance_id)).toEqual(['2','3','4','5','6','7','8','9']);
  expect(cutoff.snapshot.truncated).toBe(true);
  const absence = evidence.certifiedAbsence('room', cutoff);
  expect(absence.not_played_at_turn_start.map(row => row.utterance_id)).toEqual(['2','3','4','5','6','7','8','9']);
  expect(absence.not_played_at_turn_start_truncated).toBe(true);
});

test('late admission of a previously played original does not certify the original absent', () => {
  const evidence = createPlaybackEvidence();
  const a = reply('A', 'Approve X?');
  evidence.publication(a); evidence.complete(a);
  const cutoff = evidence.cutoff('room');
  evidence.publication({thread_id: 'room', utterance_id: 'A', attempt_id: 'retry'});
  expect(evidence.certifiedAbsence('room', cutoff).not_played_at_turn_start).toEqual([]);
});

test('source capture keeps a completed-chunk hole despite later local progress and replay', () => {
  const evidence = createPlaybackEvidence();
  const a = reply('A', 'Hello'); const b = reply('B', 'Wait'); const c = reply('C', 'Again');
  for (const item of [a,b,c]) evidence.publication(item);
  const bindings = new Map([
    ['say-a',{thread_id:'room',utterance_id:'A',replay_start_chars:0}],
    ['say-c',{thread_id:'room',utterance_id:'C',replay_start_chars:0}],
  ]);
  evidence.complete(a); // delivered after audio ingress, before delayed VAD callback
  const heard = {say_id:'say-a',hearing:'partial',heard_chars:2,played_order:1};
  const partial = {say_id:'say-c',hearing:'partial',heard_chars:1,played_order:2};
  const cutoff = evidence.cutoffFromSource('room',
    {mark:evidence.watermark(),recent:[heard,partial],last_played:partial,truncated:false},bindings);
  expect(cutoff.snapshot.knowledge).toBe('unknown');
  expect(cutoff.snapshot.last_played).toBeNull();
  expect(cutoff.states.get('A')).toBe('partial');
  expect(cutoff.states.get('B')).toBe('not_played');
  evidence.publication({thread_id:'room',utterance_id:'A',attempt_id:'retry'});
  expect(evidence.certifiedAbsence('room',cutoff).not_played_at_turn_start).toEqual([
    {utterance_id:'B',hearing:'not_played',heard_chars:0},
  ]);
});

test('a replay offset without locally captured earlier chunks cannot bridge a hole', () => {
  const evidence = createPlaybackEvidence();
  evidence.publication(reply('A','Hello world'));
  const cutoff = evidence.cutoffFromSource('room',
    {mark:1,recent:[{say_id:'retry',hearing:'partial',heard_chars:2,played_order:2}],last_played:null,truncated:true},
    new Map([['retry',{thread_id:'room',utterance_id:'A',replay_start_chars:6}]]));
  expect(cutoff.snapshot.knowledge).toBe('unknown');
  expect(cutoff.states.get('A')).toBe('unknown');
});

test('a queued B may start within the microphone block and is never certified absent', () => {
  const evidence=createPlaybackEvidence();
  evidence.publication(reply('A','First'));
  evidence.publication(reply('B','Second'));
  const source={available:true,mark:evidence.watermark(),
    recent:[{say_id:'a',hearing:'complete',heard_chars:5,played_order:1},
      {say_id:'b',hearing:'not_played',heard_chars:0,played_order:null}],
    last_played:{say_id:'a',hearing:'complete',heard_chars:5,played_order:1},truncated:false};
  const cutoff=evidence.cutoffFromSource('room',source,new Map([
    ['a',{thread_id:'room',utterance_id:'A',replay_start_chars:0}],
    ['b',{thread_id:'room',utterance_id:'B',replay_start_chars:0}],
  ]));
  expect(cutoff.snapshot.knowledge).toBe('unknown');
  expect(cutoff.states.get('B')).toBe('unknown');
  expect(evidence.certifiedAbsence('room',cutoff).not_played_at_turn_start).toEqual([]);
});

test('processed publication mark excludes a later B despite delayed candidate delivery', () => {
  const evidence = createPlaybackEvidence();
  evidence.publication(reply('A','First'));
  const mark = evidence.watermark();
  evidence.publication(reply('B','Second')); // while async VAD has not answered
  const source = {mark,recent:[{say_id:'a',hearing:'complete',heard_chars:5,played_order:1}],
    last_played:{say_id:'a',hearing:'complete',heard_chars:5,played_order:1},truncated:false};
  const cutoff = evidence.cutoffFromSource('room',source,
    new Map([['a',{thread_id:'room',utterance_id:'A',replay_start_chars:0}]]));
  expect(cutoff.snapshot.recent).toEqual([{utterance_id:'A',hearing:'complete',heard_chars:5}]);
  expect(evidence.certifiedAbsence('room',cutoff).not_played_at_turn_start).toEqual([
    {utterance_id:'B',hearing:'not_played',heard_chars:0},
  ]);
});

test('a later B say already handled by delayed VAD cannot poison A at the graph cutoff', () => {
  const evidence=createPlaybackEvidence();
  const a=reply('A','First'); const b=reply('B','Second');
  evidence.publication(a);
  const atA=evidence.watermark();
  evidence.handled(a);
  evidence.publication(b); evidence.handled(b);
  const source={available:true,mark:atA,
    recent:[{say_id:'say-a',hearing:'complete',heard_chars:5,played_order:100}],
    last_played:{say_id:'say-a',hearing:'complete',heard_chars:5,played_order:100},truncated:false};
  const cutoff=evidence.cutoffFromSource('room',source,new Map([
    ['say-a',{thread_id:'room',utterance_id:'A',replay_start_chars:0}],
    ['say-b',{thread_id:'room',utterance_id:'B',replay_start_chars:0}],
  ]));
  expect(cutoff.snapshot).toEqual({knowledge:'known',
    last_played:{utterance_id:'A',hearing:'complete',heard_chars:5},
    recent:[{utterance_id:'A',hearing:'complete',heard_chars:5}],truncated:false});
  expect(evidence.certifiedAbsence('room',cutoff).not_played_at_turn_start).toEqual([
    {utterance_id:'B',hearing:'not_played',heard_chars:0},
  ]);
});

test('last played is scoped to this thread even when another thread sounded later', () => {
  const evidence = createPlaybackEvidence();
  evidence.publication(reply('A','First'));
  const a={say_id:'a',hearing:'complete',heard_chars:5,played_order:1};
  const other={say_id:'other',hearing:'complete',heard_chars:6,played_order:2};
  const cutoff=evidence.cutoffFromSource('room',{mark:evidence.watermark(),recent:[a,other],
    last_played:other,truncated:false},new Map([
      ['a',{thread_id:'room',utterance_id:'A',replay_start_chars:0}],
      ['other',{thread_id:'elsewhere',utterance_id:'Z',replay_start_chars:0}],
    ]));
  expect(cutoff.snapshot.last_played).toEqual({utterance_id:'A',hearing:'complete',heard_chars:5});
});

test('an exhausted history stays unknown instead of treating an evicted original as new', () => {
  const evidence=createPlaybackEvidence();
  for(let i=0;i<=2048;i++)evidence.publication(reply(String(i)));
  expect(evidence.cutoff('room').snapshot.knowledge).toBe('unknown');
  expect(evidence.cutoffFromSource('room',{available:true,mark:evidence.watermark(),
    recent:[],last_played:null,truncated:false},new Map()).snapshot.knowledge).toBe('unknown');
  expect(evidence.certifiedAbsence('room',evidence.cutoff('room')).not_played_at_turn_start).toEqual([]);
});

test('an old call handle with a delayed playing callback cannot become certified silence', () => {
  const evidence=createPlaybackEvidence();
  const a=reply('A','First');
  evidence.publication(a);
  evidence.handled(a);
  const cutoff=evidence.cutoffFromSource('room',
    {available:true,mark:evidence.watermark(),recent:[],last_played:null,truncated:false},new Map());
  expect(cutoff.snapshot.knowledge).toBe('unknown');
  expect(cutoff.states.get('A')).toBe('unknown');
  expect(evidence.certifiedAbsence('room',cutoff).not_played_at_turn_start).toEqual([]);
});
