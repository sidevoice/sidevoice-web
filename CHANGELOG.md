# Changelog

## [0.2.1](https://github.com/sidevoice/sidevoice-web/compare/v0.2.0...v0.2.1) (2026-10-10)


### Bug Fixes

* **web:** the connector's commands are npx sidevoice install and pair-device ([#70](https://github.com/sidevoice/sidevoice-web/issues/70)) ([64c6159](https://github.com/sidevoice/sidevoice-web/commit/64c615933bd668ba7f15c031695679508cb72464))

## [0.2.0](https://github.com/sidevoice/sidevoice-web/compare/v0.1.0...v0.2.0) (2026-10-10)


### ⚠ BREAKING CHANGES

* the call speaks text with the room; its voice is @sidevoice/voice behind one seam ([#60](https://github.com/sidevoice/sidevoice-web/issues/60))

### Features

* **desktop:** the call controls card page, built with the room ([#23](https://github.com/sidevoice/sidevoice-web/issues/23)) ([140115f](https://github.com/sidevoice/sidevoice-web/commit/140115fd5122c9652763b0c5e47105f21f4cee95))
* **settings:** select = load and verify, with diagnostics (model-first engines, phase 3) ([#18](https://github.com/sidevoice/sidevoice-web/issues/18)) ([c332228](https://github.com/sidevoice/sidevoice-web/commit/c3322282e931b8057e2190bfec3e84f8f1fd3901))
* the call speaks text with the room; its voice is @sidevoice/voice behind one seam ([#60](https://github.com/sidevoice/sidevoice-web/issues/60)) ([c5cf4a0](https://github.com/sidevoice/sidevoice-web/commit/c5cf4a07975ca371f684473658850a97fe404074))
* voice settings and provider keys on this device; latency dialog shows what the room measures ([#61](https://github.com/sidevoice/sidevoice-web/issues/61)) ([92db7f7](https://github.com/sidevoice/sidevoice-web/commit/92db7f789a76b4775d47b5a84985ab020bfe1a43))
* **web:** add local host setup entry points ([#42](https://github.com/sidevoice/sidevoice-web/issues/42)) ([4ae0911](https://github.com/sidevoice/sidevoice-web/commit/4ae0911d4946db84f9523489966f18d1b137be51))
* **web:** integrate local host and machine setup ([#41](https://github.com/sidevoice/sidevoice-web/issues/41)) ([b832bec](https://github.com/sidevoice/sidevoice-web/commit/b832bec21d1c3da63282d05e57073281b8c606c9))
* **web:** keep the call through a dropped connection ([#58](https://github.com/sidevoice/sidevoice-web/issues/58)) ([e4f40e8](https://github.com/sidevoice/sidevoice-web/commit/e4f40e8b38ce1b1fd52ae0f2bd4429b1be07bba1))
* **web:** the call is a stage — agent with a speech bubble, transcript behind a button, collapsible conversations ([#66](https://github.com/sidevoice/sidevoice-web/issues/66)) ([7576eae](https://github.com/sidevoice/sidevoice-web/commit/7576eae86ec33065a5d2695be376639267bfb7cc))


### Bug Fixes

* the outbox never waits on a turn's answer, restored messages go, and no old selection is inferred ([#63](https://github.com/sidevoice/sidevoice-web/issues/63)) ([2fc436e](https://github.com/sidevoice/sidevoice-web/commit/2fc436e0746a93b91364134bfcd72da80a8343f5))
* **web:** a text box mounted after load sends, as after pairing the first machine ([#67](https://github.com/sidevoice/sidevoice-web/issues/67)) ([f783f56](https://github.com/sidevoice/sidevoice-web/commit/f783f56203e64068cc89ef63fb45207ef7ab0fd9))
