# Changelog

## [0.13.0](https://github.com/sidevoice/sidevoice-web/compare/v0.12.0...v0.13.0) (2026-10-28)


### Features

* **call:** join and listen without a microphone ([#380](https://github.com/sidevoice/sidevoice-web/issues/380)) ([97662fe](https://github.com/sidevoice/sidevoice-web/commit/97662fe95b6d57d7c30982c072d7d987305b343c))


### Bug Fixes

* **call:** keep dismissed call audio error closed; follow motion changes live ([#379](https://github.com/sidevoice/sidevoice-web/issues/379)) ([d964783](https://github.com/sidevoice/sidevoice-web/commit/d9647836de4621999168517746e8a58a18766dc2))

## [0.12.0](https://github.com/sidevoice/sidevoice-web/compare/v0.11.1...v0.12.0) (2026-10-28)


### Features

* **onboarding:** confirm skipping transcription and voice like the machine ([#377](https://github.com/sidevoice/sidevoice-web/issues/377)) ([bf1f32e](https://github.com/sidevoice/sidevoice-web/commit/bf1f32ecbc7cb2bb584abd7a982a1c6b0f263b5b))


### Bug Fixes

* **permissions:** say what to do when no microphone is found ([#376](https://github.com/sidevoice/sidevoice-web/issues/376)) ([cef8f03](https://github.com/sidevoice/sidevoice-web/commit/cef8f038b68dbacbacf731ec05ebab016a1a9b08))

## [0.11.1](https://github.com/sidevoice/sidevoice-web/compare/v0.11.0...v0.11.1) (2026-10-28)


### Bug Fixes

* **room:** a closed conversation leaves the screen and a disconnected one is never shown as working ([#371](https://github.com/sidevoice/sidevoice-web/issues/371)) ([af12a7c](https://github.com/sidevoice/sidevoice-web/commit/af12a7c86dc67d65aed6ec331013352a1291d147))
* **room:** name the away machine instead of "No machine available" ([#372](https://github.com/sidevoice/sidevoice-web/issues/372)) ([a8f125f](https://github.com/sidevoice/sidevoice-web/commit/a8f125f0634e6a1b65ab01864838fa51d1df648c))

## [0.11.0](https://github.com/sidevoice/sidevoice-web/compare/v0.10.1...v0.11.0) (2026-10-26)


### Features

* **agents:** say when the last agent scan failed ([#355](https://github.com/sidevoice/sidevoice-web/issues/355)) ([b3cf1b4](https://github.com/sidevoice/sidevoice-web/commit/b3cf1b4637c099b6581f6e2fd2d793966aeda04f))
* **models:** language list and model size summary variants ([#350](https://github.com/sidevoice/sidevoice-web/issues/350)) ([4693b73](https://github.com/sidevoice/sidevoice-web/commit/4693b73b9a2f3cf3a828bb93188af9473155870f))
* **voice:** always-on audio diagnostics ([#354](https://github.com/sidevoice/sidevoice-web/issues/354)) ([8e2889c](https://github.com/sidevoice/sidevoice-web/commit/8e2889cdbdd6ea5676f44753be1ce22d3758d63e))


### Bug Fixes

* **avatar:** the card and the main view show the same creature step ([#353](https://github.com/sidevoice/sidevoice-web/issues/353)) ([f93f770](https://github.com/sidevoice/sidevoice-web/commit/f93f770d10b6589469fc63d7ebeaeb3d852cc1fd))
* **call:** a call goes back to the conversation picked even when the room does not list it ([#358](https://github.com/sidevoice/sidevoice-web/issues/358)) ([ddfbed4](https://github.com/sidevoice/sidevoice-web/commit/ddfbed46840f3ca7a69153a2da79d516d2c9e00c))
* **call:** no PiP while no conversation is chosen ([#343](https://github.com/sidevoice/sidevoice-web/issues/343)) ([91a24ba](https://github.com/sidevoice/sidevoice-web/commit/91a24baf0a372bfab31b1117839310e6087d0902))
* **call:** the call follows the latest pick, even one that could not go at once ([#359](https://github.com/sidevoice/sidevoice-web/issues/359)) ([b288144](https://github.com/sidevoice/sidevoice-web/commit/b28814439ec3eb55fb0105d001dd41dae86d47d5))
* **microphone:** keep missing from the desktop request ([#368](https://github.com/sidevoice/sidevoice-web/issues/368)) ([1252698](https://github.com/sidevoice/sidevoice-web/commit/125269849050cffeae78289e331f6d7c72fe69c6))
* **onboarding:** clarify what connecting an agent is for ([#349](https://github.com/sidevoice/sidevoice-web/issues/349)) ([7a55a41](https://github.com/sidevoice/sidevoice-web/commit/7a55a410e9b8fa7aac413068ad8348dab560cfe5))
* **onboarding:** show the chosen device name in This device at once ([#344](https://github.com/sidevoice/sidevoice-web/issues/344)) ([18d0ae2](https://github.com/sidevoice/sidevoice-web/commit/18d0ae2d009330389f7138d0c41cb47dd0b9583a)), closes [#333](https://github.com/sidevoice/sidevoice-web/issues/333)
* **settings:** default the voice sample text to the interface language ([#346](https://github.com/sidevoice/sidevoice-web/issues/346)) ([c64f913](https://github.com/sidevoice/sidevoice-web/commit/c64f9139e2e5b7f248d36434f24974ca42837332)), closes [#335](https://github.com/sidevoice/sidevoice-web/issues/335)
* **settings:** shorten end-of-turn tooltips ([#348](https://github.com/sidevoice/sidevoice-web/issues/348)) ([d164ea7](https://github.com/sidevoice/sidevoice-web/commit/d164ea7a5df5b37ba07e04d57074cfed2df2ab8d))
* show microphone settings for settings-only desktop hosts ([#363](https://github.com/sidevoice/sidevoice-web/issues/363)) ([ae6a2f1](https://github.com/sidevoice/sidevoice-web/commit/ae6a2f121c8c7945a1959890f4112e9ed6c00969))
* **transcription:** show the slow-on-this-device warning only above 5 s ([#345](https://github.com/sidevoice/sidevoice-web/issues/345)) ([a944097](https://github.com/sidevoice/sidevoice-web/commit/a944097eedd9457ed24c11cc4f1d9e88cd04b196))
* **ui:** keep native scrollbars clear of conversation cards ([#364](https://github.com/sidevoice/sidevoice-web/issues/364)) ([59edaf6](https://github.com/sidevoice/sidevoice-web/commit/59edaf6bad515b0df0b620c4c277f4b52d4df0d4))
* **voice:** end the end-of-turn take where the turn ended ([#342](https://github.com/sidevoice/sidevoice-web/issues/342)) ([3389ba9](https://github.com/sidevoice/sidevoice-web/commit/3389ba9723ee8d877271107d9e8b5d98cec7f79c)), closes [#331](https://github.com/sidevoice/sidevoice-web/issues/331)

## [0.10.1](https://github.com/sidevoice/sidevoice-web/compare/v0.10.0...v0.10.1) (2026-10-21)


### Performance Improvements

* **avatar:** an avatar with no box does not follow the voice ([#324](https://github.com/sidevoice/sidevoice-web/issues/324)) ([4bbe8d8](https://github.com/sidevoice/sidevoice-web/commit/4bbe8d8c4c93e28a1cae0bffe0c7b71b3dee9a62))
* **avatar:** held still, the stage's mouth does not follow the voice either ([#322](https://github.com/sidevoice/sidevoice-web/issues/322)) ([f626abe](https://github.com/sidevoice/sidevoice-web/commit/f626abeae683f8c11fc95c52966846aef0e296e1))
* **call:** the balloon's words are lit by moving windows, not by repainting text ([#323](https://github.com/sidevoice/sidevoice-web/issues/323)) ([fb165cb](https://github.com/sidevoice/sidevoice-web/commit/fb165cb79be9ba4aa2531948ff3c267a5d3bdc31))

## [0.10.0](https://github.com/sidevoice/sidevoice-web/compare/v0.9.0...v0.10.0) (2026-10-21)


### Features

* **call:** tell the desktop app whether the room shows the stage ([#314](https://github.com/sidevoice/sidevoice-web/issues/314)) ([fcadcae](https://github.com/sidevoice/sidevoice-web/commit/fcadcae47e1f81832ee7212629db27177ef11186))
* **settings:** a developer option to animate conversation thumbnails ([#318](https://github.com/sidevoice/sidevoice-web/issues/318)) ([310b8f4](https://github.com/sidevoice/sidevoice-web/commit/310b8f4e1653ca6e8d695a67ce5bab4fe5c4e4f5))
* **settings:** developer options on nightly builds ([#307](https://github.com/sidevoice/sidevoice-web/issues/307)) ([ca164e7](https://github.com/sidevoice/sidevoice-web/commit/ca164e7ce64f9d9243a52a0fc575364a643f1ca0))
* **voice:** turn defaults tuned in real calls ([#320](https://github.com/sidevoice/sidevoice-web/issues/320)) ([077d9e1](https://github.com/sidevoice/sidevoice-web/commit/077d9e1884fd6b1e447d418cfa8dcae95b61f10f))


### Bug Fixes

* **call-card:** the picture card's grid column cannot outgrow the card ([#306](https://github.com/sidevoice/sidevoice-web/issues/306)) ([4658dc7](https://github.com/sidevoice/sidevoice-web/commit/4658dc7955253f0cbc860f084e70f3c726236b65))
* **room:** the conversation count lives inside the conversations icon ([#312](https://github.com/sidevoice/sidevoice-web/issues/312)) ([dfc0b6b](https://github.com/sidevoice/sidevoice-web/commit/dfc0b6be772adb051c74ee22d65e909dacac3c13)), closes [#309](https://github.com/sidevoice/sidevoice-web/issues/309)


### Performance Improvements

* **conversation:** a closed transcript does not light the words the voice says ([#316](https://github.com/sidevoice/sidevoice-web/issues/316)) ([f1f8974](https://github.com/sidevoice/sidevoice-web/commit/f1f897499e8efe47cc343fca9d4c2f1044bcd252))
* **conversation:** the text box measures itself only when its state changes ([#315](https://github.com/sidevoice/sidevoice-web/issues/315)) ([bdec082](https://github.com/sidevoice/sidevoice-web/commit/bdec0820e40814afe725e5999026f9f0362e5234))
* **room:** conversation thumbnails keep their mouth still ([#310](https://github.com/sidevoice/sidevoice-web/issues/310)) ([324fdbe](https://github.com/sidevoice/sidevoice-web/commit/324fdbeaa67e14dd8ee988ad57ef6dc4cbce0352))

## [0.9.0](https://github.com/sidevoice/sidevoice-web/compare/v0.8.3...v0.9.0) (2026-10-21)


### Features

* **call-card:** "!" for unread replies in the header ([#261](https://github.com/sidevoice/sidevoice-web/issues/261)) ([5125109](https://github.com/sidevoice/sidevoice-web/commit/5125109104defd061e10a8df721540df7c2c21ab))
* **call-card:** free resize for the picture-in-picture ([#258](https://github.com/sidevoice/sidevoice-web/issues/258)) ([e312aab](https://github.com/sidevoice/sidevoice-web/commit/e312aab2bb2f2239894a45ab1dc7fb88132f656b))
* **call-card:** picture-in-picture by default ([#259](https://github.com/sidevoice/sidevoice-web/issues/259)) ([189c1a8](https://github.com/sidevoice/sidevoice-web/commit/189c1a80589b4ca11e43656fd8a218629319a503))
* **call-card:** the avatar's compact card ([#283](https://github.com/sidevoice/sidevoice-web/issues/283)) ([8349198](https://github.com/sidevoice/sidevoice-web/commit/83491984ab0194e80c2fdd04020eeca09f8b7778))
* **call-card:** the avatar's controls open from a handle ([#263](https://github.com/sidevoice/sidevoice-web/issues/263)) ([6a2230f](https://github.com/sidevoice/sidevoice-web/commit/6a2230f3869eb3f43178b6d389b704f8d341c077))
* **call:** captions toggle in the call bar and an upward balloon tail ([#254](https://github.com/sidevoice/sidevoice-web/issues/254)) ([2a79062](https://github.com/sidevoice/sidevoice-web/commit/2a790621ea22206aeeb954ccb5a926b9c17bc03a)), closes [#239](https://github.com/sidevoice/sidevoice-web/issues/239) [#240](https://github.com/sidevoice/sidevoice-web/issues/240)
* **callcard:** preview the card and drop the custom size from Settings ([#256](https://github.com/sidevoice/sidevoice-web/issues/256)) ([543133d](https://github.com/sidevoice/sidevoice-web/commit/543133d38f7e170b775aa9f39d411dc65639ba87))
* **callcard:** the floating card's three formats on the room's own components, and its Settings section ([#255](https://github.com/sidevoice/sidevoice-web/issues/255)) ([1413891](https://github.com/sidevoice/sidevoice-web/commit/141389158a61ac7ab8ceae1041c437a8fb33cca0))
* **conversation:** jump-to-latest is a centered down arrow, no text ([#299](https://github.com/sidevoice/sidevoice-web/issues/299)) ([0509c5f](https://github.com/sidevoice/sidevoice-web/commit/0509c5fce91730347af9bdb06fc1ccc6b212ef88)), closes [#52](https://github.com/sidevoice/sidevoice-web/issues/52)
* **onboarding:** the try's own button is Stop while its try runs ([#228](https://github.com/sidevoice/sidevoice-web/issues/228)) ([a1095d5](https://github.com/sidevoice/sidevoice-web/commit/a1095d58a608d764b3bdd38f846082acbbef0a25)), closes [#225](https://github.com/sidevoice/sidevoice-web/issues/225)
* **room:** each machine's group in the conversations wears its connected mark ([#233](https://github.com/sidevoice/sidevoice-web/issues/233)) ([8ca2473](https://github.com/sidevoice/sidevoice-web/commit/8ca247363aeb1ef367e3b04b05af5194d6d81b99))
* **room:** show the conversation count in the list, as the call card does ([#298](https://github.com/sidevoice/sidevoice-web/issues/298)) ([a88fde1](https://github.com/sidevoice/sidevoice-web/commit/a88fde10dd6a7820c2e977b3ebca96da73faba31)), closes [#252](https://github.com/sidevoice/sidevoice-web/issues/252)
* **settings:** disable model choice until a remote provider has its key ([#217](https://github.com/sidevoice/sidevoice-web/issues/217)) ([7df9ed0](https://github.com/sidevoice/sidevoice-web/commit/7df9ed0dde2ab88291597660c28f2a47ed6f70e5)), closes [#206](https://github.com/sidevoice/sidevoice-web/issues/206)
* **settings:** hidden developer panel to tune turn and barge-in numbers ([#288](https://github.com/sidevoice/sidevoice-web/issues/288)) ([e0f85b0](https://github.com/sidevoice/sidevoice-web/commit/e0f85b05a9a0c1176858c1def03eaa5081223e93))
* **settings:** Preferred position and Size ([#271](https://github.com/sidevoice/sidevoice-web/issues/271)) ([059cc47](https://github.com/sidevoice/sidevoice-web/commit/059cc4700001252498ea42a5fd60f72e98b9674f))
* **settings:** turn the floating card off ([#262](https://github.com/sidevoice/sidevoice-web/issues/262)) ([3dc8e7b](https://github.com/sidevoice/sidevoice-web/commit/3dc8e7b4843894371d9bb97b75ff8fa4d7235aea))
* **voice:** start calls with input and output halves, update them live, preload chosen models ([#246](https://github.com/sidevoice/sidevoice-web/issues/246)) ([4ec4d96](https://github.com/sidevoice/sidevoice-web/commit/4ec4d9662dd88045eb0675f6b7f9c9a9a7648627)), closes [#160](https://github.com/sidevoice/sidevoice-web/issues/160) [#204](https://github.com/sidevoice/sidevoice-web/issues/204) [#225](https://github.com/sidevoice/sidevoice-web/issues/225) [#150](https://github.com/sidevoice/sidevoice-web/issues/150)
* **voice:** the app owns the turn and barge-in numbers and hands them to the voice ([#269](https://github.com/sidevoice/sidevoice-web/issues/269)) ([32c2627](https://github.com/sidevoice/sidevoice-web/commit/32c262772fc6520c27c794d6afc38d564f44beed))


### Bug Fixes

* **audio:** a reply already here plays to its end whatever happens to the link ([#226](https://github.com/sidevoice/sidevoice-web/issues/226)) ([ead820a](https://github.com/sidevoice/sidevoice-web/commit/ead820ae0ec185e0eb0ef98f66c3151417d84af5)), closes [#220](https://github.com/sidevoice/sidevoice-web/issues/220)
* **audio:** play only the conversation in focus ([#208](https://github.com/sidevoice/sidevoice-web/issues/208)) ([ca2ba6f](https://github.com/sidevoice/sidevoice-web/commit/ca2ba6fda808e2cdae226480a7280d64890b16af)), closes [#200](https://github.com/sidevoice/sidevoice-web/issues/200)
* **audio:** replies held across a new session of the same call still play ([#238](https://github.com/sidevoice/sidevoice-web/issues/238)) ([3f48cc8](https://github.com/sidevoice/sidevoice-web/commit/3f48cc80031b41b4dd512289f3a8e2adec2078cc))
* **avatar:** a robot's arm covers the body's gloss, so no stripe crosses it ([#245](https://github.com/sidevoice/sidevoice-web/issues/245)) ([0b7ad61](https://github.com/sidevoice/sidevoice-web/commit/0b7ad615cd8db04e64cfff28f27c00fcbf1cc208)), closes [#194](https://github.com/sidevoice/sidevoice-web/issues/194)
* **avatar:** keep the card thumbnail in step with the stage ([#211](https://github.com/sidevoice/sidevoice-web/issues/211)) ([4e31fc3](https://github.com/sidevoice/sidevoice-web/commit/4e31fc340157d5055352b2809b4dbd6240f6b3a9))
* **call-card:** close the devices panel once the room confirms the device ([#295](https://github.com/sidevoice/sidevoice-web/issues/295)) ([77ed67e](https://github.com/sidevoice/sidevoice-web/commit/77ed67e55928486efcfe295c2ec3677681ef7ff3))
* **call-card:** no working badge over the creature ([#257](https://github.com/sidevoice/sidevoice-web/issues/257)) ([1d04670](https://github.com/sidevoice/sidevoice-web/commit/1d04670404a58c321d7999b521291b7d2e216273))
* **call-card:** the avatar's controls stay open while the pointer is near ([#267](https://github.com/sidevoice/sidevoice-web/issues/267)) ([c56bb76](https://github.com/sidevoice/sidevoice-web/commit/c56bb764a0b033fdbe7f4be80bb495c14c179e18))
* **call-card:** the list drops from its control; the compact card never moves the creature sideways ([#285](https://github.com/sidevoice/sidevoice-web/issues/285)) ([ba5c84f](https://github.com/sidevoice/sidevoice-web/commit/ba5c84fb9ed0f158680be728d1c8e9e57241bd7c))
* **call-card:** the title gives way to the fixed controls ([#260](https://github.com/sidevoice/sidevoice-web/issues/260)) ([08c8e60](https://github.com/sidevoice/sidevoice-web/commit/08c8e6052b9d0caacefe4455cc2f20cc50a2dc53))
* **call-card:** the wave holds still in silence instead of rendering 10 times a second ([#276](https://github.com/sidevoice/sidevoice-web/issues/276)) ([4e87da3](https://github.com/sidevoice/sidevoice-web/commit/4e87da35b71c0aa884cb25f07f49ec85618e8b86))
* **call:** a call's machine that stops answering reads as away ([#232](https://github.com/sidevoice/sidevoice-web/issues/232)) ([1d129d1](https://github.com/sidevoice/sidevoice-web/commit/1d129d1c9523498c4cdfaf160140e9600fa4cfeb))
* **callcard:** the card's shadow ends inside the window's margin ([#303](https://github.com/sidevoice/sidevoice-web/issues/303)) ([55de6c2](https://github.com/sidevoice/sidevoice-web/commit/55de6c209067b610ef8a420bed1341fbfbb2f48c))
* **call:** don't block call and text on agent reachability ([#212](https://github.com/sidevoice/sidevoice-web/issues/212)) ([e416788](https://github.com/sidevoice/sidevoice-web/commit/e416788aa30d8d8d9487d13f768b4dfc47072bcb)), closes [#198](https://github.com/sidevoice/sidevoice-web/issues/198)
* **call:** drop the hover shading on the stage heading ([#297](https://github.com/sidevoice/sidevoice-web/issues/297)) ([a802cb9](https://github.com/sidevoice/sidevoice-web/commit/a802cb967c04d53dc050d9959a8a71ed987fafec)), closes [#253](https://github.com/sidevoice/sidevoice-web/issues/253)
* **call:** speaking again while a turn is transcribed shows listening ([#236](https://github.com/sidevoice/sidevoice-web/issues/236)) ([d6b770b](https://github.com/sidevoice/sidevoice-web/commit/d6b770bcf2957ed4bd064653f8645298a4db384b))
* **call:** start a call again after its microphone or speaker fails ([#224](https://github.com/sidevoice/sidevoice-web/issues/224)) ([d766011](https://github.com/sidevoice/sidevoice-web/commit/d76601171ba722bf174bc73fc0c34d01e55e41cf)), closes [#190](https://github.com/sidevoice/sidevoice-web/issues/190) [#192](https://github.com/sidevoice/sidevoice-web/issues/192)
* **conversation:** the waveform runs no frame loop out of sight ([#275](https://github.com/sidevoice/sidevoice-web/issues/275)) ([b0d7ba5](https://github.com/sidevoice/sidevoice-web/commit/b0d7ba50e1269e90cf7423022955c47269835795))
* **mic:** trust a granted microphone on iOS Safari ([#234](https://github.com/sidevoice/sidevoice-web/issues/234)) ([06be0f5](https://github.com/sidevoice/sidevoice-web/commit/06be0f5f16ee5e81d5a080dd665bfb0d80e25fb1)), closes [#231](https://github.com/sidevoice/sidevoice-web/issues/231)
* **models:** a model download's bar follows its bytes and no longer runs back at its start ([#222](https://github.com/sidevoice/sidevoice-web/issues/222)) ([232c1a0](https://github.com/sidevoice/sidevoice-web/commit/232c1a0da1f8d0c9ab811f67e99e25f7819e6fa7))
* **onboarding:** a voice try only listens, and a try's result stays with its model ([#215](https://github.com/sidevoice/sidevoice-web/issues/215)) ([0782a75](https://github.com/sidevoice/sidevoice-web/commit/0782a756689a8cb4aad52edd942d05cb5111c8ab)), closes [#207](https://github.com/sidevoice/sidevoice-web/issues/207)
* **onboarding:** Back passes a paired machine's step, as going on does ([#242](https://github.com/sidevoice/sidevoice-web/issues/242)) ([812dee7](https://github.com/sidevoice/sidevoice-web/commit/812dee7dece36304a6b32a0cb2031ce6a1dfa2fb)), closes [#186](https://github.com/sidevoice/sidevoice-web/issues/186)
* **onboarding:** word a voice try's device failures as a try, not a call ([#213](https://github.com/sidevoice/sidevoice-web/issues/213)) ([ba8d6a3](https://github.com/sidevoice/sidevoice-web/commit/ba8d6a31798db4ecd6d393e5d9ba41aebf21cbf4)), closes [#205](https://github.com/sidevoice/sidevoice-web/issues/205)
* **room:** no banner for a stale playback or hearing report ([#218](https://github.com/sidevoice/sidevoice-web/issues/218)) ([6378932](https://github.com/sidevoice/sidevoice-web/commit/63789328d8f3d7ce528e0fe1f9e8da316b0f6b16)), closes [#199](https://github.com/sidevoice/sidevoice-web/issues/199)
* **settings:** always-show controls under Style, reflected in the previews ([#270](https://github.com/sidevoice/sidevoice-web/issues/270)) ([a505e19](https://github.com/sidevoice/sidevoice-web/commit/a505e19c815220f1c7d85c51fc3e7ed4b907b218))
* **settings:** end the card preview on leaving, keep Reset size and position enabled ([#268](https://github.com/sidevoice/sidevoice-web/issues/268)) ([2235e2f](https://github.com/sidevoice/sidevoice-web/commit/2235e2fd377bfb26990af1473dfa9e116f483ac6))
* **settings:** still card previews and a real check on the chosen one ([#264](https://github.com/sidevoice/sidevoice-web/issues/264)) ([53ca318](https://github.com/sidevoice/sidevoice-web/commit/53ca318e6de31922de4d44bfe0af7580540176f2))
* **stage:** the person's balloon stays with the conversation they spoke to ([#244](https://github.com/sidevoice/sidevoice-web/issues/244)) ([e17cf15](https://github.com/sidevoice/sidevoice-web/commit/e17cf15924531399c7a3bbdd5c6deb468bac68f1)), closes [#243](https://github.com/sidevoice/sidevoice-web/issues/243)
* **stage:** the speech balloon follows what plays, and nothing else ([#227](https://github.com/sidevoice/sidevoice-web/issues/227)) ([bcd11dd](https://github.com/sidevoice/sidevoice-web/commit/bcd11ddd7079b59b28f36a63d34b6b400aeae8a7)), closes [#221](https://github.com/sidevoice/sidevoice-web/issues/221)
* **state:** show the working state outside calls ([#209](https://github.com/sidevoice/sidevoice-web/issues/209)) ([124a163](https://github.com/sidevoice/sidevoice-web/commit/124a163fc0fcf8fc025d47f48c73e3e756378a99))
* **ui:** show the language icon only on the voice language filter ([#216](https://github.com/sidevoice/sidevoice-web/issues/216)) ([1d441cc](https://github.com/sidevoice/sidevoice-web/commit/1d441ccb0a0d6cf6738d11c774afea40a94fbad3)), closes [#203](https://github.com/sidevoice/sidevoice-web/issues/203)
* **update:** hang the update notice under the conversation's title ([#202](https://github.com/sidevoice/sidevoice-web/issues/202)) ([7bbc7ec](https://github.com/sidevoice/sidevoice-web/commit/7bbc7ecaff6362aa0dba12859e8d9550249ee440))
* **voice:** say so when a model download stops receiving bytes ([#248](https://github.com/sidevoice/sidevoice-web/issues/248)) ([1300c59](https://github.com/sidevoice/sidevoice-web/commit/1300c594700bae52ca4787fe0ba278c036cbb908)), closes [#223](https://github.com/sidevoice/sidevoice-web/issues/223)
* **voice:** word a missing permission and a plan that does not allow apart from a rejected key ([#219](https://github.com/sidevoice/sidevoice-web/issues/219)) ([959b46b](https://github.com/sidevoice/sidevoice-web/commit/959b46b13aabbb299ca0b399f6f184ac809f28f0)), closes [#195](https://github.com/sidevoice/sidevoice-web/issues/195)


### Performance Improvements

* **avatar:** creatures stay still; motion only where it carries state ([#274](https://github.com/sidevoice/sidevoice-web/issues/274)) ([e1c5322](https://github.com/sidevoice/sidevoice-web/commit/e1c5322deffb2fc5fc8826f50b130947ba9c74c8))
* **avatar:** the stage's and the card's creatures move as GPU layers ([#292](https://github.com/sidevoice/sidevoice-web/issues/292)) ([47942c7](https://github.com/sidevoice/sidevoice-web/commit/47942c758a7c03613a7ab4ae62e0564809a96f9b))
* **call-card:** your wave's bars move by transform, not by height ([#290](https://github.com/sidevoice/sidevoice-web/issues/290)) ([b595c16](https://github.com/sidevoice/sidevoice-web/commit/b595c16cf8cc29919571de8f8343d569a4e45894))
* **call:** the agent speaking restyles only its mouth and re-renders only its balloon ([#302](https://github.com/sidevoice/sidevoice-web/issues/302)) ([a6ffc74](https://github.com/sidevoice/sidevoice-web/commit/a6ffc74a1e410d659c4203de4a4c13f155e1e521))
* **call:** the microphone's bars follow each reading without a transition ([#300](https://github.com/sidevoice/sidevoice-web/issues/300)) ([0d6b625](https://github.com/sidevoice/sidevoice-web/commit/0d6b6257b10bc392d2a338a6dcb764a69f867390))
* **call:** the microphone's bars move by transform, not by height ([#289](https://github.com/sidevoice/sidevoice-web/issues/289)) ([b6bf0d0](https://github.com/sidevoice/sidevoice-web/commit/b6bf0d067f19faa37b6b6697216ad024d1954f19))
* **conversation:** the live waveform is bars that move by transform, not a canvas ([#296](https://github.com/sidevoice/sidevoice-web/issues/296)) ([823331d](https://github.com/sidevoice/sidevoice-web/commit/823331d94b8447dea7098293f121990e4d7a99d0))
* nothing animates where nobody sees it, and a guard for what moves ([#301](https://github.com/sidevoice/sidevoice-web/issues/301)) ([a26816e](https://github.com/sidevoice/sidevoice-web/commit/a26816ee0fdce10221e0f2b8d1836eb4606f600b))
* **stage:** no spinner inside the hidden Working status ([#287](https://github.com/sidevoice/sidevoice-web/issues/287)) ([fb37062](https://github.com/sidevoice/sidevoice-web/commit/fb37062cb219fdf92022f256ea0f30317fda49c1))


### Reverts

* creatures move again (back out [#274](https://github.com/sidevoice/sidevoice-web/issues/274)) ([#291](https://github.com/sidevoice/sidevoice-web/issues/291)) ([88ba4f4](https://github.com/sidevoice/sidevoice-web/commit/88ba4f4e4e11c55441e1c7c6c3e905f2bde5eaea))

## [0.8.3](https://github.com/sidevoice/sidevoice-web/compare/v0.8.2...v0.8.3) (2026-10-18)


### Bug Fixes

* **deploy:** redirect by path so the static image never sends visitors to port 8080 ([#196](https://github.com/sidevoice/sidevoice-web/issues/196)) ([4d71671](https://github.com/sidevoice/sidevoice-web/commit/4d71671d74e3f5fb6fc20bb1a34beef9315776cb))

## [0.8.2](https://github.com/sidevoice/sidevoice-web/compare/v0.8.1...v0.8.2) (2026-10-18)


### Bug Fixes

* **test:** cover setup language picker in browser e2e ([#181](https://github.com/sidevoice/sidevoice-web/issues/181)) ([255d411](https://github.com/sidevoice/sidevoice-web/commit/255d41137e9970711d175629d3355100fab35ae1))
* **web:** recover onboarding transcription and Safari microphone access ([#191](https://github.com/sidevoice/sidevoice-web/issues/191)) ([3fc7971](https://github.com/sidevoice/sidevoice-web/commit/3fc79715419ce0dddd0020a6c9cbebc540114333)), closes [#188](https://github.com/sidevoice/sidevoice-web/issues/188)

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
