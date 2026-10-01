# Browser Kokoro audio

From the repository root, build with `npm ci && npm run build`. The static web that `scripts/assemble-static-web.mjs` assembles carries this package's `dist` at `/voice-browser/`, and the desktop app bundles the same layout. The React `/voice/` application (`apps/web`) consumes `room-client.js` for browser-local synthesis and transcription; `/voice-browser/` remains a diagnostic page. Requires HTTPS or localhost for WebGPU.

Actual synthesis and phonemization run in a browser Worker. Models are fetched
from a fixed Hugging Face revision and cached by Transformers.js. Voice embeddings
use Cache API. eSpeak-NG 1.0.2 is bundled with its full language data, unlike the
English-only phonemizer distribution used by kokoro-js. Spanish phoneme mappings
follow Misaki's EspeakG2P conventions; human pronunciation evaluation remains due.

Validated in a desktop browser on an Apple Silicon Mac:
- WebGPU Spanish Dora: 4.325 s audio / 1.018 s inference+phonemization (warm model).
- WebGPU English Heart: 4.425 s audio / .998 s inference+phonemization.
- WASM Spanish Dora: 4.325 s audio / 9.503 s inference+phonemization, one thread.
These are individual smoke measurements, not a general benchmark. Cold download
and initialization take longer. Browser Kokoro is the conversation default.

Cancel stops Web Audio immediately, increments the request generation and discards
later outputs. A running model operation can finish computing; it is not replayed.
The model queue is serial. CPU fallback currently covers GPU initialization failure;
runtime/device-loss recovery remains to be tested before integrating into calls.

The package exposes both the production browser runtime and a standalone diagnostic page. Room lifecycle and durable delivery remain the responsibility of `apps/web` and of the node (sidevoice-core).

Dependencies retain their licenses: Transformers.js/ONNX Runtime (Apache/MIT as
shipped upstream), Kokoro model (Apache-2.0), eSpeak-NG JS/WASM (GPL-3.0-or-later).
No code was copied from tts.rocks. Its engine selection and cache design were
reviewed as references: https://github.com/steveseguin/tts-web.

## Catalogues: copies of sidevoice-core's

`catalog.json` (voices), `models.json` (the model catalogue, sidevoice/sidevoice-core#21) and
`models.vectors.json` (the resolver's shared vectors) belong to sidevoice/sidevoice-core and are
copied here byte for byte, never edited: `node copy-core-catalogs.mjs <sidevoice-core checkout>`.
The core's `tests/test_catalog_contract.py` checks the copies against it when `SIDEVOICE_REPOSITORY`
names this checkout. `page-models.js` reads `models.json` for the page's Whisper list (`stt-engine.js`
`MODELS`) and Kokoro's repository, revision and dtypes (`engine.js`); nothing in the page names a
model. `offers.ts` is the resolver in TypeScript, passing the same vectors as the core's
Python and the desktop app's Rust. The web computes *Este dispositivo* with it: in a page from what the
page measures (`wasm`, `webgpu`, `webgpu-f16`), in the desktop app only from the native bridge's
`capabilities()`. The chosen offer decides the worker: a page family adapter (`stt-engine.js` for
whisper, `engine.js` for kokoro) on the offer's accelerator, or `native-worker.js` with the catalogue
model id and engine. Both are keyed by catalogue model id; there is no page-id mapping.

`checks/` is sidevoice-core's too (`models/checks/`, copied by the same script; `build.mjs` serves it
at `/voice-browser/checks/`): the clips and phrases a model is checked with before it takes effect,
and the thresholds it is judged by. `model-check.js` judges what came back, as the core's
`verdicts.py` does for a provider. A check runs in a worker of its own — `stt-client.js` and
`room-client.js` hand one out with `candidate()` — and a model that passed takes the place of the one
in use with `adopt()`: the old worker finishes what it was doing, then is let go. In the desktop app the
native worker also loads the build on the bridge (`load`, unless `loaded()` lists it) and says the step
a failure happened at (download, load, run) with the app's refusal.

## Room integration

`catalog.json` declares six speech languages, their voices' names and a preview sentence each.
Each device keeps one setting per stage (`stt`, `tts`): a place (`device` or a provider), a
catalogue model, the options its family's schema declares (Kokoro: a voice per language and a
speed), and an optional build override. sidevoice-core validates it against the catalogue.

With the voice on `device`, the node dispatches `voice-speech` (text, model, voice, speed,
language, session/revision/utterance) over the room WebSocket, without invoking server TTS; the
page runs it on its own resolved build. The browser acknowledges playing and playback_finished
only after the last AudioBufferSource ends. This confirms browser playout, not human
comprehension. The next utterance waits for this receipt. Generation errors mark failed.
Server VAD starts and binding changes send cancellation; the client stops all scheduled
sources, cancels the worker epoch, and ignores late results. VAD still runs in the
server, so onset latency includes microphone transport; client-side VAD is future work.

Model weights download automatically from the pinned Hugging Face revision into browser
cache; preparing loads the model into memory and initializes the GPU/CPU. Clearing
site data, eviction, another browser/origin, or a changed model can require download again.
GPU and CPU use different weight variants. STT can run locally in this package through
Transformers.js or use a provider through the node; cloud keys never move into the browser.

UI language (Spanish/English) is independent of speech language. Joining or previewing
automatically opens a progress dialog for model loading, voice assets and first synthesis. Explicit preload is optional.
User text and task titles are excluded from UI translation.
