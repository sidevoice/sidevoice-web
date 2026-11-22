# Third-party components

Sidevoice's Apache-2.0 license applies to its own code. Dependencies and models keep
their original licenses. This repository does not bundle weights or generated
browser assets.

Major components include Pipecat, Transformers.js, ONNX Runtime, Kokoro-82M and
its ONNX conversion, eSpeak NG, the OpenTelemetry SDKs for Python and the browser
(Apache-2.0), and the MCP TypeScript SDK in the Claude draft.
Earlier experiments reference MLX Audio, Pocket TTS and FluidAudio.

The desktop app's call controls card bundles the DM Sans typeface
(`apps/web/public/fonts/`), under the SIL Open Font License 1.1, with its
licence beside it (`OFL.txt`).

The web's agent creatures (`apps/web/src/features/avatar/creature/`) are drawn with
three.js, which the web bundles (MIT, notice below). The creatures' eye language — big
leaning ovals, lids, gaze, voice-driven pupils — is inspired by Void
(https://github.com/PLAYER99-void/void, MIT, © 2026 PLAYER99-void); no Void code is
used.

The web shows other products' marks to identify their integrations (OpenAI, ElevenLabs,
Claude, Codex, Cursor, and the Model Context Protocol for any other agent): each is its owner's trademark, taken unaltered from its brand kit
(`apps/web/src/assets/logos/`, with each source and its usage rules), and implies no
endorsement.

In particular, eSpeak NG has GPL license obligations when redistributing its
generated WASM/bundles. Review upstream licenses and model cards before
redistributing compiled assets or weights; the repository's Apache-2.0 license does
not replace those terms.

- https://github.com/pipecat-ai/pipecat
- https://github.com/huggingface/transformers.js
- https://github.com/microsoft/onnxruntime
- https://huggingface.co/hexgrad/Kokoro-82M
- https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- https://github.com/espeak-ng/espeak-ng
- https://github.com/open-telemetry/opentelemetry-python
- https://github.com/open-telemetry/opentelemetry-js
- https://github.com/socketio/socket.io
- https://github.com/socketio/socket.io-client
- https://github.com/miguelgrinberg/python-socketio
- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/mrdoob/three.js
- https://github.com/PLAYER99-void/void

## three.js

Bundled into the web app (`three`, `apps/web`) — https://github.com/mrdoob/three.js

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
