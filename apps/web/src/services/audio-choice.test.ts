import {expect, test} from 'vitest';
import {withoutLost} from './audio-choice';
import {replyEligibility} from './reply-eligibility.js';

test('a lost speaker is forgotten and the microphone choice is kept', () => {
  expect(withoutLost({input: 'mic', output: 'spk'}, {output: 'spk'})).toEqual({input: 'mic'});
  expect(withoutLost({input: 'mic', output: 'spk'}, {input: 'mic', output: 'spk'})).toEqual({});
  expect(withoutLost({input: 'mic'}, null)).toEqual({input: 'mic'});
});

test('losing the speaker does not mute: with output on, a reply still plays', () => {
  const facts = {sessionId: 's', threadId: 'a', focused: true, epoch: 2, openTurns: new Set<string>(), output: 'on', connected: true};
  expect(replyEligibility({session_id: 's', thread_id: 'a', epoch: 2}, facts)).toBe('play');
});
