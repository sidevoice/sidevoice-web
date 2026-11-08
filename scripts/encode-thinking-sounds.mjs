#!/usr/bin/env node
// Makes the thinking sounds the page and the iOS app play (apps/web/public/sounds/thinking/): each approved sound of the
// sound lab, from its WAV, as Opus in WebM (the page, where it decodes it) and as AAC in MP4 (Safari, WebKit's webviews and
// the iOS app's own player), and the manifest both read (sounds.json: the default, then each sound's id, cadence and files).
//
//   node scripts/encode-thinking-sounds.mjs <lab>      (<lab>: the lab's folder, with sounds.json and audio/)
//
// The files keep the level the lab measured: each one is decoded again and measured (EBU R 128 integrated loudness and
// momentary maximum), and the script stops if one moves by more than LEVEL_TOLERANCE_DB. The offset the person sets in
// Settings is applied as the sound plays, never here. Needs ffmpeg (built with libopus) on the PATH, or FFMPEG.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The approved sounds in the order Settings lists them, the first the default: the id the app keeps, and the lab's own. */
const SOUNDS = [
  ['soft-heartbeat', 'G'], ['warm-pad-pulse', 'P'], ['slow-heartbeat', 'U'], ['echoing-heartbeat', 'V'],
  ['pulsing-hum', 'X'], ['muffled-heartbeat', 'Y'], ['slow-double-beat', 'AA'], ['single-beat', 'AB'],
  ['room-heartbeat', 'AC'], ['breathing-pad', 'AD'], ['double-pad-pulse', 'AE'], ['slow-breath', 'AF'],
  ['deep-heartbeat', 'AG'], ['warm-heartbeat', 'AH'], ['soft-pad-pulse', 'AI'], ['low-breath', 'AJ'],
];
/** 64 kbit/s mono keeps every sound's loudness within 0.2 dB in both codecs. ffmpeg's own AAC encoder, with its default
 *  coder, overshoots the first frame of a short low thump by several dB; its fast coder does not. */
const OPUS = ['-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-application', 'audio'];
const AAC = ['-c:a', 'aac', '-aac_coder', 'fast', '-b:a', '64k', '-movflags', '+faststart'];
const LEVEL_TOLERANCE_DB = 0.3;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/web/public/sounds/thinking');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const lab = process.argv[2];
if (!lab) { console.error('usage: node scripts/encode-thinking-sounds.mjs <lab folder>'); process.exit(2); }
const labSounds = new Map(JSON.parse(readFileSync(path.join(lab, 'sounds.json'), 'utf8')).sounds.map((sound) => [sound.id, sound]));

/** Integrated loudness and momentary maximum, in LUFS. */
function levels(file) {
  const run = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = run.stderr;
  const at = log.lastIndexOf('Summary:');
  if (run.status !== 0 || at < 0) throw new Error(`${file}: ffmpeg could not measure it`);
  const integrated = Number(/I:\s+(-?[\d.]+) LUFS/.exec(log.slice(at))[1]);
  const momentary = Math.max(...[...log.slice(0, at).matchAll(/ M:\s*(-?[\d.]+)/g)].map((match) => Number(match[1])));
  return { integrated, momentary };
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const manifest = { default: SOUNDS[0][0], sounds: [] };
let bytes = 0;
for (const [id, letter] of SOUNDS) {
  const source = labSounds.get(letter);
  if (!source || !Array.isArray(source.interval)) throw new Error(`the lab has no sound ${letter} played now and then`);
  const wav = path.join(lab, 'audio', source.file);
  const files = { webm: `${id}.webm`, m4a: `${id}.m4a` };
  const want = levels(wav);
  for (const [format, args] of [['webm', OPUS], ['m4a', AAC]]) {
    const file = path.join(out, files[format]);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', wav, '-ac', '1', ...args, file]);
    const got = levels(file);
    const moved = Math.max(Math.abs(got.integrated - want.integrated), Math.abs(got.momentary - want.momentary));
    if (moved > LEVEL_TOLERANCE_DB) throw new Error(`${files[format]}: its level moved by ${moved.toFixed(1)} dB`);
    bytes += statSync(file).size;
    console.log(`${files[format].padEnd(24)} ${got.integrated.toFixed(1)} LUFS (lab ${want.integrated.toFixed(1)}), M max ${got.momentary.toFixed(1)} (lab ${want.momentary.toFixed(1)})`);
  }
  manifest.sounds.push({ id, interval: source.interval, files });
}
// One line a sound, as it reads in a review.
writeFileSync(path.join(out, 'sounds.json'), `{\n  "default": ${JSON.stringify(manifest.default)},\n  "sounds": [\n${manifest.sounds.map((sound) => '    ' + JSON.stringify(sound)).join(',\n')}\n  ]\n}\n`);
console.log(`${SOUNDS.length} sounds, ${Math.round(bytes / 1024)} KiB, into ${path.relative(process.cwd(), out)}`);
