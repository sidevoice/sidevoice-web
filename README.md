<!-- Header: .github/assets/readme-header*.svg, from the Sidevoice brand's banner. Badges: shieldcn
     (https://shieldcn.dev), each a light/dark pair so the row follows the reader's GitHub theme. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-header-on-dark.svg" />
  <img alt="Sidevoice — Give your coding agent a voice. Keep the conversation." src=".github/assets/readme-header.svg" width="750" />
</picture>

<p>
  <a href="https://github.com/sidevoice/sidevoice-web/actions/workflows/release.yml"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/ci/sidevoice/sidevoice-web.svg?variant=secondary&size=sm&workflow=release.yml&branch=main&mode=dark" /><img alt="build status" src="https://shieldcn.dev/github/ci/sidevoice/sidevoice-web.svg?variant=secondary&size=sm&workflow=release.yml&branch=main&mode=light" /></picture></a>
  <a href="LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/license/sidevoice/sidevoice-web.svg?variant=secondary&size=sm&mode=dark" /><img alt="licence" src="https://shieldcn.dev/github/license/sidevoice/sidevoice-web.svg?variant=secondary&size=sm&mode=light" /></picture></a>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/node-22+.svg?variant=secondary&size=sm&logo=nodedotjs&mode=dark" /><img alt="requires Node.js 22 or newer" src="https://shieldcn.dev/badge/node-22+.svg?variant=secondary&size=sm&logo=nodedotjs&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/status-beta.svg?variant=secondary&size=sm&mode=dark" /><img alt="status: beta" src="https://shieldcn.dev/badge/status-beta.svg?variant=secondary&size=sm&mode=light" /></picture>
</p>

# sidevoice-web

Reading your coding agent's plans, diffs and summaries all day is tiring. **Sidevoice** turns the conversation you
already have with your agent into a voice call. The agent keeps its context and keeps writing as usual; it also
speaks its replies, and you answer by voice and can interrupt it — from the sofa or on a walk, not only at your desk.

**sidevoice-web** is the call interface: the screen you talk from. It pairs a device with your machine, shows the
conversation, and holds the call's voice: it hears you, says the agent's replies and lets you interrupt them, on the
device itself, and speaks only text with the room. The voice is [sidevoice-voice](https://github.com/sidevoice/sidevoice-voice)'s
module: on the web `@sidevoice/voice` on `@sidevoice/engine`, in the desktop app its native build.

## How it fits

| Piece | Role |
|---|---|
| [sidevoice-connector](https://github.com/sidevoice/sidevoice-connector) | What you install on the machine where your agents run: their voice tools, and the supervisor of that machine's core. |
| [sidevoice-core](https://github.com/sidevoice/sidevoice-core) | The conversations and the room, next to the agents. This interface talks to it, in text. |
| [sidevoice-desktop](https://github.com/sidevoice/sidevoice-desktop) | The app you call from. It bundles this interface and runs speech models natively. |
| **sidevoice-web** (this repository) | The call interface, released as a versioned static site. |

Your **machine** is the computer where your coding agents run; a **device** is what you call from. Most people get
this interface inside the desktop app. It is also a static site anyone can serve; a device using it still needs to
reach its machine directly, since the relay for reaching it from outside your network is not available yet.

## Status

Beta. What works today:

- Pairing with a machine through a one-time code, and calls with its conversations.
- Speaking with turn detection on the machine, interrupting the agent mid-sentence, and typing alongside voice.
- Transcription and speech on the device itself, or through a provider (OpenAI, ElevenLabs) with your own key,
  chosen per device by model.
- Several devices in the same conversation at once.

## Serve it

Each release attaches `sidevoice-web-X.Y.Z.tar.gz`, a static site, with its `SHA256SUMS`. Serve it over HTTPS (the
microphone needs a secure context). `voice/target.js` may set where the interface looks first; without it, the
pairing code says where the machine is.

Or build the container image from this repository:

```sh
docker build -f deploy/web-static/Dockerfile -t sidevoice-web .
docker run -p 8080:8080 sidevoice-web          # optional: -e SIDEVOICE_TARGET=https://your-machine.example
```

The container serves plain HTTP on port 8080: fine on `localhost`, but anywhere else put HTTPS in front of it, or
the browser will not allow the microphone.

The site holds no secret: a device becomes trusted only by redeeming a code its machine issued.

## Develop

Node.js 22:

```sh
npm ci
npm run build          # protocol, browser audio, then the React app
npm test
npm run dev:web        # hot reload; proxies /api to a core on 127.0.0.1:8767
```

For the dev server, run a core from [sidevoice-core](https://github.com/sidevoice/sidevoice-core) with
`sidevoice-core --port 8767`.

```
apps/web/                 the React interface (Vite)
packages/protocol/        the event schema shared with the core
deploy/web-static/        the static-site container
scripts/                  assembles the static site the releases and the desktop app use
```

## Contributing

Issues and pull requests are welcome. Read [`AGENTS.md`](AGENTS.md) first: it holds the rules for code, texts and
tests, for people and coding agents alike — every user-facing text goes through i18n, with English as the
fallback. Pull request titles follow [Conventional Commits](https://www.conventionalcommits.org) (CI checks them)
and become the squashed commit, from which release notes are written ([`RELEASING.md`](RELEASING.md)).

## Licence

[Apache-2.0](LICENSE). The Sidevoice name and logo are trademarks: forks are welcome under their own name — see
[`TRADEMARKS.md`](TRADEMARKS.md).

## Third-party components

Bundled components keep their own licences — notably eSpeak NG, under the GPL, inside the release's speech
workers: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
