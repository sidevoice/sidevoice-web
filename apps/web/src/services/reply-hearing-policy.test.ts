import { expect, test } from 'vitest';
import { HEARING_POLICY, playbackHearing, writtenReplyHearing } from './reply-hearing-policy.js';

test('T01/T14 full, partial, zero and failure extents use Unicode scalar hearing', () => {
  expect(playbackHearing({ status: 'heard' }, 'é🐙ab')).toEqual({ outcome: 'heard' });
  expect(playbackHearing({ status: 'interrupted', heard_chars: 2, reason: 'user_interrupted' }, 'é🐙ab')).toEqual({ outcome: 'partial', heard_chars: 2 });
  expect(playbackHearing({ status: 'interrupted', heard_chars: 0 }, 'é🐙ab')).toEqual({ outcome: 'not_heard' });
  expect(playbackHearing({ status: 'failed', heard_chars: 2 }, 'é🐙ab')).toEqual({ outcome: 'partial', heard_chars: 2 });
});

test('T06a–c/T07 mute, voice off, disconnect and focus are app delivery choices', () => {
  for (const action of ['agents_muted', 'voice_off', 'connector_disconnected', 'focus_changed', 'call_ended'])
    expect(playbackHearing({ status: 'interrupted', heard_chars: 2 }, 'é🐙ab', action)).toEqual({ outcome: 'not_heard' });
});

test('T12 skip defaults to heard and can be changed without a protocol skip value', () => {
  const report = { status: 'interrupted', heard_chars: 2 };
  expect(playbackHearing(report, 'é🐙ab', 'user_skipped')).toEqual({ outcome: 'heard' });
  expect(playbackHearing(report, 'é🐙ab', 'user_skipped', { ...HEARING_POLICY, skipCountsAsHeard: false }))
    .toEqual({ outcome: 'partial', heard_chars: 2 });
});

test('H2/T06d–e/T16 written delivery follows this page, not shared audio status or reason', () => {
  const visible = { outputMuted: true, displayed: true };
  const hidden = { outputMuted: true, displayed: false };
  for (const status of ['text_only', 'playing', 'interrupted'])
    expect(writtenReplyHearing({ status }, visible)).toEqual({ outcome: 'not_heard' });
  const reading = { ...HEARING_POLICY, readMutedReplies: true };
  for (const status of ['text_only', 'playing', 'interrupted']) {
    expect(writtenReplyHearing({ status }, visible, reading)).toEqual({ outcome: 'heard' });
    expect(writtenReplyHearing({ status }, hidden, reading)).toEqual({ outcome: 'not_heard' });
  }
  expect(writtenReplyHearing({ status: 'playing' }, { outputMuted: false, displayed: true }, reading)).toBeNull();
  expect(writtenReplyHearing({ status: 'text_only' }, { outputMuted: false, displayed: true }, reading)).toEqual({ outcome: 'not_heard' });
});
