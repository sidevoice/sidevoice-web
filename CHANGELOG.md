# Changelog

## [0.8.1](https://github.com/sidevoice/sidevoice-web/compare/v0.8.0...v0.8.1) (2026-10-18)


### Bug Fixes

* **onboarding:** drop the language icon from the interface language picker ([#184](https://github.com/sidevoice/sidevoice-web/issues/184)) ([bb8242b](https://github.com/sidevoice/sidevoice-web/commit/bb8242b29373a596c99416ba73dcbb99bc7daffd))

## [0.8.0](https://github.com/sidevoice/sidevoice-web/compare/v0.7.3...v0.8.0) (2026-10-18)


### Features

* **voice:** add searchable voice and language pickers ([#178](https://github.com/sidevoice/sidevoice-web/issues/178)) ([1c6f0e0](https://github.com/sidevoice/sidevoice-web/commit/1c6f0e0324872da6a3694a872f0c5445d6171045))


### Bug Fixes

* **room:** remember offline conversations across restarts ([#176](https://github.com/sidevoice/sidevoice-web/issues/176)) ([cbc806c](https://github.com/sidevoice/sidevoice-web/commit/cbc806c1357e01cddf85c69e77ce7f1e17636966))
* **voice:** match preview sample to selected speaker ([#174](https://github.com/sidevoice/sidevoice-web/issues/174)) ([8ccf135](https://github.com/sidevoice/sidevoice-web/commit/8ccf1357ebfe54539df0be474366bcb95b1d030e))
* **web:** refine pairing and transcript visual feedback ([#175](https://github.com/sidevoice/sidevoice-web/issues/175)) ([e435e37](https://github.com/sidevoice/sidevoice-web/commit/e435e37b25594c9990e962ee5ac91511724840dc))

## [0.7.3](https://github.com/sidevoice/sidevoice-web/compare/v0.7.2...v0.7.3) (2026-10-17)


### Bug Fixes

* **pairing:** infer private HTTP port from machine code ([#168](https://github.com/sidevoice/sidevoice-web/issues/168)) ([9a97dda](https://github.com/sidevoice/sidevoice-web/commit/9a97dda672a2101633a3025bdb0f59cd3aba006c))

## [0.7.2](https://github.com/sidevoice/sidevoice-web/compare/v0.7.1...v0.7.2) (2026-10-16)


### Bug Fixes

* **devices:** keep the device list fresh from the runtime ([#157](https://github.com/sidevoice/sidevoice-web/issues/157)) ([f6dbd7b](https://github.com/sidevoice/sidevoice-web/commit/f6dbd7b3f6ddd12b08ae36c70f9a01d668ba0a0e)), closes [#156](https://github.com/sidevoice/sidevoice-web/issues/156)

## [0.7.1](https://github.com/sidevoice/sidevoice-web/compare/v0.7.0...v0.7.1) (2026-10-16)


### Bug Fixes

* **copy:** name the connector's commands with npx ([#155](https://github.com/sidevoice/sidevoice-web/issues/155)) ([f7081c7](https://github.com/sidevoice/sidevoice-web/commit/f7081c7de53a18322848b466bc519ab2eda6831e))
* **room:** one quiet unread mark, only for a conversation you're not in ([#162](https://github.com/sidevoice/sidevoice-web/issues/162)) ([4533b43](https://github.com/sidevoice/sidevoice-web/commit/4533b43bfb63969f36f0d7050ce66a4d3b42873c))
* **transcript:** the person's live voice uses the stage's balloon ([#159](https://github.com/sidevoice/sidevoice-web/issues/159)) ([827391b](https://github.com/sidevoice/sidevoice-web/commit/827391bc45bf306cf7c01f4e9da07ae93e487e0b))
* **voice:** losing the chosen speaker no longer leaves agents muted ([#161](https://github.com/sidevoice/sidevoice-web/issues/161)) ([5eccffc](https://github.com/sidevoice/sidevoice-web/commit/5eccffcdd39e087cb703dbef2f2264d1adb23e03))

## [0.7.0](https://github.com/sidevoice/sidevoice-web/compare/v0.2.1...v0.7.0) (2026-10-16)


### Features

* Add per-host agent setup in Machines ([#43](https://github.com/sidevoice/sidevoice-web/issues/43)) ([e7ebd66](https://github.com/sidevoice/sidevoice-web/commit/e7ebd665fd66da8c3987c90e1f944d8bf2680852)), closes [#39](https://github.com/sidevoice/sidevoice-web/issues/39)
* **agents:** show readiness on agent cards ([#133](https://github.com/sidevoice/sidevoice-web/issues/133)) ([77f56b5](https://github.com/sidevoice/sidevoice-web/commit/77f56b5868b06da6cd6e89cad61e88ff29f11a69)), closes [#98](https://github.com/sidevoice/sidevoice-web/issues/98)
* **avatar:** follow agent playback levels ([#116](https://github.com/sidevoice/sidevoice-web/issues/116)) ([1263cf0](https://github.com/sidevoice/sidevoice-web/commit/1263cf049f480e9c6cc48b03ca09a35e758d667a)), closes [#113](https://github.com/sidevoice/sidevoice-web/issues/113)
* **bubbles:** soft cards, and bigger, clearer speech on the stage ([#120](https://github.com/sidevoice/sidevoice-web/issues/120)) ([6af6d76](https://github.com/sidevoice/sidevoice-web/commit/6af6d766230e84bd6690d7d6a543c4808b7c4e0d)), closes [#114](https://github.com/sidevoice/sidevoice-web/issues/114)
* **data:** add desktop data deletion in Advanced settings ([#127](https://github.com/sidevoice/sidevoice-web/issues/127)) ([1d10454](https://github.com/sidevoice/sidevoice-web/commit/1d1045431d27bf912d4382b85b0381176dfc2891))
* **i18n:** six new UI languages, one catalogue per language ([#100](https://github.com/sidevoice/sidevoice-web/issues/100)) ([582afe7](https://github.com/sidevoice/sidevoice-web/commit/582afe73625b2d403fba55821c04bf11cd8af295))
* **models:** use engine accelerator class for runtime labels ([#122](https://github.com/sidevoice/sidevoice-web/issues/122)) ([17114b1](https://github.com/sidevoice/sidevoice-web/commit/17114b184c9b991ac83c922b6310505e4ad9b9ef))
* **onboarding:** prepare this computer, or do it yourself with the command ([#102](https://github.com/sidevoice/sidevoice-web/issues/102)) ([68a48da](https://github.com/sidevoice/sidevoice-web/commit/68a48dadf220ee03df7867fa3a4047d937b54718))
* **trial:** Stop ends the open turn at once with endInput ([#141](https://github.com/sidevoice/sidevoice-web/issues/141)) ([a40d07f](https://github.com/sidevoice/sidevoice-web/commit/a40d07f0a45a1fee78af1baab4e512391c773c33))
* **turns:** honor conversation epochs and playback fate ([#126](https://github.com/sidevoice/sidevoice-web/issues/126)) ([f520828](https://github.com/sidevoice/sidevoice-web/commit/f52082809e4d58b07a17fd078d0a56fc17cc171c))
* **updates:** cancel a download in progress ([#144](https://github.com/sidevoice/sidevoice-web/issues/144)) ([eb84c65](https://github.com/sidevoice/sidevoice-web/commit/eb84c65ed1c9ed87adcf97b5ea0c99d191d499fb))
* **voice:** route input through a call per conversation ([#140](https://github.com/sidevoice/sidevoice-web/issues/140)) ([4fa01aa](https://github.com/sidevoice/sidevoice-web/commit/4fa01aa041b516b99653394d4ddc49f0d9d91d7a))
* **voice:** use voice 0.4.0 takes and playback level ([#124](https://github.com/sidevoice/sidevoice-web/issues/124)) ([3d3ddf4](https://github.com/sidevoice/sidevoice-web/commit/3d3ddf45f48d2ae5a353d85039688c22be0be62e))
* **web:** each conversation's agent is a bicho, on a stage with a backdrop, a desk and a wanted poster ([#81](https://github.com/sidevoice/sidevoice-web/issues/81)) ([030275d](https://github.com/sidevoice/sidevoice-web/commit/030275dab714db34481466e252badb3b95c4c925))
* **web:** first-run setup: where you work, the agents, and this device's voice tried for real ([#97](https://github.com/sidevoice/sidevoice-web/issues/97)) ([483011d](https://github.com/sidevoice/sidevoice-web/commit/483011d011577e667047452d8aea6954a11aee40))


### Bug Fixes

* **agents:** show only the agents installed on a machine, and Other ([#128](https://github.com/sidevoice/sidevoice-web/issues/128)) ([d343663](https://github.com/sidevoice/sidevoice-web/commit/d34366317c9eca12b4b770bda1eaa6af98a630a0))
* **call:** the unread dot sits on the transcript button in the call bar ([#115](https://github.com/sidevoice/sidevoice-web/issues/115)) ([d64f55c](https://github.com/sidevoice/sidevoice-web/commit/d64f55ce1d42591e87e2b3161757feedb1eef315))
* **call:** Working shows only once the agent has worked 3 s without a break ([#117](https://github.com/sidevoice/sidevoice-web/issues/117)) ([1e933c4](https://github.com/sidevoice/sidevoice-web/commit/1e933c4068f9d89fb4c0631440d55033075fda39))
* **copy:** stop saying room/sala to the user ([#99](https://github.com/sidevoice/sidevoice-web/issues/99)) ([e26a01d](https://github.com/sidevoice/sidevoice-web/commit/e26a01d4ec62a3e462313bd1417da566ae39dba8))
* **onboarding:** prepare this computer shows the install command when the app cannot install ([#101](https://github.com/sidevoice/sidevoice-web/issues/101)) ([f2f16e6](https://github.com/sidevoice/sidevoice-web/commit/f2f16e6c062fee0dfd9850d111da27558eee32cc))
* **onboarding:** the try's own button in its block from the start, and the block before its model is ready ([#107](https://github.com/sidevoice/sidevoice-web/issues/107)) ([3f1b364](https://github.com/sidevoice/sidevoice-web/commit/3f1b364806094c836ef014156df224ada2e2abef))
* **room:** agent cards build one title, show Working, and blink a green light while working ([#119](https://github.com/sidevoice/sidevoice-web/issues/119)) ([cc468a3](https://github.com/sidevoice/sidevoice-web/commit/cc468a3d53c15a04641ea6f322a3c24f5a6fe6ed))
* **settings:** a model of another family no longer breaks Voice or Transcription ([#106](https://github.com/sidevoice/sidevoice-web/issues/106)) ([f7e23b8](https://github.com/sidevoice/sidevoice-web/commit/f7e23b85199c4d0d6328b33db04f4ac3be560a9a))
* **settings:** a model's "runs on" names its real accelerator ([#108](https://github.com/sidevoice/sidevoice-web/issues/108)) ([15f9918](https://github.com/sidevoice/sidevoice-web/commit/15f99180a0c6f2b3ceeb2a87da3358c417e49529))
* **settings:** the Connect dialog opens whole on the macOS app ([#135](https://github.com/sidevoice/sidevoice-web/issues/135)) ([2641b94](https://github.com/sidevoice/sidevoice-web/commit/2641b948034400225111612e5f01f5cc595617fc)), closes [#134](https://github.com/sidevoice/sidevoice-web/issues/134)
* **settings:** the end-of-turn try says where the person is: not started, speaking, in a pause, their turn ended ([#109](https://github.com/sidevoice/sidevoice-web/issues/109)) ([cf12993](https://github.com/sidevoice/sidevoice-web/commit/cf1299366afa25acbb924eab9975b914aeb01c84))
* **settings:** the voice is always a list, even with one choice in it ([#104](https://github.com/sidevoice/sidevoice-web/issues/104)) ([dcc15b1](https://github.com/sidevoice/sidevoice-web/commit/dcc15b145b5f35fa24142253929b5c19cb8583f1))
* **setup:** keep host preparation in its intended place ([#125](https://github.com/sidevoice/sidevoice-web/issues/125)) ([cd4da72](https://github.com/sidevoice/sidevoice-web/commit/cd4da72a0cdb1ee6535b54220f9e502fb404c904)), closes [#123](https://github.com/sidevoice/sidevoice-web/issues/123)
* **try:** Stop ends the transcription take on screen at once ([#105](https://github.com/sidevoice/sidevoice-web/issues/105)) ([42446a2](https://github.com/sidevoice/sidevoice-web/commit/42446a26656c80e01f2f8b37d74957280619c394))
* **try:** the transcription try ends at Stop, 10 s or the voice's own end of the turn, and its take marks only its start and stop ([#131](https://github.com/sidevoice/sidevoice-web/issues/131)) ([c8cc6fe](https://github.com/sidevoice/sidevoice-web/commit/c8cc6fe369ee527ba4f91a4b1be904cc7409e6c4))
* **ui:** visual polish from the operator's trial ([#139](https://github.com/sidevoice/sidevoice-web/issues/139)) ([366fcd9](https://github.com/sidevoice/sidevoice-web/commit/366fcd946ee3984692b20866f1f1686f7dd788a1))
* **voice:** the end-of-turn model downloads only from its Download; until then a call ends turns with silence ([#132](https://github.com/sidevoice/sidevoice-web/issues/132)) ([8257553](https://github.com/sidevoice/sidevoice-web/commit/825755307579e56bb2034797b72ffabd1a68e930))
* **web:** a browser that blocks site data says so, and the voice never shows a bare error number ([#73](https://github.com/sidevoice/sidevoice-web/issues/73)) ([094605b](https://github.com/sidevoice/sidevoice-web/commit/094605bc9b4c9dd92b42891e82e236fe9eb6bfe8))
* **web:** a voice try loads no end-of-turn model, so End of turn's download is real ([#103](https://github.com/sidevoice/sidevoice-web/issues/103)) ([c3f1b36](https://github.com/sidevoice/sidevoice-web/commit/c3f1b36f4452ef34eafbb9eeaa590aada30139bf))
* **web:** Settings opens from the header menu again ([#76](https://github.com/sidevoice/sidevoice-web/issues/76)) ([2d5bee0](https://github.com/sidevoice/sidevoice-web/commit/2d5bee01196784645cef01b00066ce6f05761b14))

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
