const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
// Only src/host names a host mechanism, and only host() is how (lint/host-rules.mjs). Each pattern the code has used, and each
// way round it a review found, is a fixture here: the lint is as good as the patterns it is shown.
const web=path.resolve(__dirname,'..');
async function lint(code,filename){
 const {Linter}=require('eslint');
 const {hostRules}=await import('../lint/host-rules.mjs');
 return new Linter({configType:'flat',cwd:web}).verify(code,hostRules,{filename}).filter(m=>m.ruleId).map(m=>m.message);
}
const OUTSIDE='src/features/example.ts';
const injected=[
 ['a read of the global','const host = window.__sidevoiceHost?.host;'],
 ['the global it replaces','const host = window.__sidevoiceDesktop?.host;'],
 ['optional chaining on window','const host = (globalThis.window as any)?.__sidevoiceHost;'],
 ['globalThis, not window','const host = globalThis.__sidevoiceHost;'],
 ['bracket access','const host = window["__sidevoiceDesktop"];'],
 ['bracket access with single quotes and ?.','const host = window?.[\'__sidevoiceHost\'];'],
 ['defineProperty','Object.defineProperty(window, "__sidevoiceHost", { value: {} });'],
 ['a test of it with in','if ("__sidevoiceDesktop" in window) run();'],
 ['an assignment','(window as any).__sidevoiceHost = { host: {} };'],
 ['a deletion','delete (window as any).__sidevoiceDesktop;'],
 ['a destructuring','const { __sidevoiceHost } = window as any;'],
 ['a declaration of it','declare global { interface Window { __sidevoiceDesktop?: unknown } }'],
 ['a template','const key = `__sidevoiceHost`;'],
];
const navigator=[
 ['navigator.userAgent','const a = navigator.userAgent;'],
 ['navigator?.userAgent','const a = navigator?.userAgent;'],
 ['window.navigator.userAgent','const a = window.navigator.userAgent;'],
 ['globalThis.navigator?.platform','const a = globalThis.navigator?.platform;'],
 ['self.navigator.platform','const a = self.navigator.platform;'],
 ['a window handed in, win.navigator?.userAgentData?.platform','const a = win.navigator?.userAgentData?.platform;'],
 ['bracket access','const a = navigator["userAgent"];'],
 ['bracket access on window.navigator','const a = window.navigator?.["platform"];'],
 ['bracket access on the navigator itself','const a = globalThis["navigator"]["userAgent"];'],
 ['userAgentData','const a = navigator.userAgentData;'],
 ['the Media Session','navigator.mediaSession.setActionHandler("play", run);'],
 ['the Media Session, optional','const s = globalThis.navigator?.mediaSession;'],
 ['the wake lock','await navigator.wakeLock.request("screen");'],
 ['the wake lock, optional','if (!globalThis.navigator?.wakeLock?.request) return;'],
 ['the audio session','navigator.audioSession.type = "play-and-record";'],
 ['a member a browser adds tomorrow','const a = navigator.something;'],
 ['a member by a name held in a variable','const a = navigator[member];'],
 // The ways round, which a review found: the navigator held under another name, or in a pattern.
 ['an alias of the global','const n = navigator; await n.wakeLock.request("screen");'],
 ['an alias of window.navigator','const n = window.navigator; const a = n.userAgent;'],
 ['an alias of globalThis.navigator','const n = globalThis.navigator;'],
 ['an alias by assignment','let n; n = navigator;'],
 ['an alias through a cast','const n = navigator as any;'],
 ['an alias through a cast, read in place','const a = (navigator as any).userAgent;'],
 ['a destructuring of navigator','const { userAgent } = navigator;'],
 ['a destructuring of window.navigator','const { wakeLock, mediaSession: session } = window.navigator;'],
 ['a destructuring of the bracketed global','const { wakeLock } = globalThis["navigator"];'],
 ['a destructuring of a member the host does not give, from an allowed one\'s owner','const { clipboard } = navigator;'],
 ['navigator taken out of the window','const { navigator: n } = window;'],
 ['navigator taken out of globalThis','const { navigator } = globalThis;'],
 ['navigator taken out by a string key','const { "navigator": n } = window;'],
 ['navigator handed on','run(navigator);'],
 ['window.navigator handed on','run(window.navigator);'],
 ['navigator kept in an object','const kept = { navigator };'],
 ['navigator kept in a field','holder.nav = globalThis.navigator;'],
 ['navigator returned','const get = () => navigator;'],
 ['a test of it with typeof','if (typeof navigator === "undefined") return;'],
 ['a test of a member with in','const has = "wakeLock" in navigator;'],
 ['a test of a member with in, on window.navigator','const has = "mediaSession" in window.navigator;'],
 // clientInformation is the navigator under another name: window.clientInformation === window.navigator.
 ['clientInformation.userAgent','const a = clientInformation.userAgent;'],
 ['window.clientInformation.userAgent','const a = window.clientInformation.userAgent;'],
 ['globalThis.clientInformation?.platform','const a = globalThis.clientInformation?.platform;'],
 ['self.clientInformation.userAgentData','const a = self.clientInformation.userAgentData;'],
 ['clientInformation, bracketed','const a = self["clientInformation"].userAgent;'],
 ['clientInformation, in a template','const a = window[`clientInformation`].userAgent;'],
 ['the Media Session of clientInformation','clientInformation.mediaSession.setActionHandler("play", run);'],
 ['an alias of clientInformation','const n = clientInformation; const a = n.platform;'],
 ['an alias of window.clientInformation','const n = window.clientInformation;'],
 ['a destructuring of clientInformation','const { userAgent } = clientInformation;'],
 ['clientInformation handed on','run(clientInformation);'],
 ['a test of clientInformation with typeof','if (typeof clientInformation === "undefined") return;'],
 ['clientInformation taken out of the window','const { clientInformation: n } = window;'],
 ['clientInformation taken out of globalThis','const { clientInformation } = globalThis;'],
 ['clientInformation taken out by a string key','const { "clientInformation": n } = window;'],
 // A key written as a template with nothing interpolated is the name it spells, as a string is.
 ['navigator in a template','const a = window[`navigator`].userAgent;'],
 ['navigator in a template, optional','const a = window?.[`navigator`]?.platform;'],
 ['navigator in a template, on globalThis, held','const n = globalThis[`navigator`];'],
 ['navigator in a bracketed string, optional','const a = window?.["navigator"]?.userAgent;'],
 ['navigator in a template, then a member in a template','const a = window[`navigator`][`userAgentData`];'],
 ['userAgent in a template','const a = navigator[`userAgent`];'],
 ['platform in a template, optional','const a = navigator?.[`platform`];'],
 ['userAgentData in a template','const a = window.navigator[`userAgentData`]?.platform;'],
 ['userAgentData in a bracketed string','const a = navigator["userAgentData"];'],
 ['the Media Session in a template','navigator[`mediaSession`].setActionHandler("play", run);'],
 ['navigator taken out by a template key','const { [`navigator`]: n } = window;'],
 ['navigator taken out by a computed string key','const { ["navigator"]: n } = window;'],
 ['clientInformation taken out by a template key','const { [`clientInformation`]: n } = globalThis;'],
 ['a test of a member in a template with in','const has = "wakeLock" in window[`navigator`];'],
];
const microphone=[
 ['getUserMedia','await navigator.mediaDevices.getUserMedia({ audio: true });'],
 ['getUserMedia, optional','await media?.getUserMedia?.({ audio: true });'],
 ['getUserMedia through a name','const open = devices.getUserMedia.bind(devices);'],
 ['getUserMedia through an alias of mediaDevices','const m = navigator.mediaDevices; await m.getUserMedia({ audio: true });'],
 ['getUserMedia by brackets','await devices["getUserMedia"]({ audio: true });'],
 ['getUserMedia in a template','await devices[`getUserMedia`]({ audio: true });'],
 ['a destructuring of it by a template key','const { [`getUserMedia`]: open } = navigator.mediaDevices;'],
 ['a typeof of it','if (typeof media.getUserMedia === "function") ask();'],
 ['a destructuring of it','const { getUserMedia } = navigator.mediaDevices;'],
 ['a test of it with in','const has = "getUserMedia" in mediaDevices;'],
];
const imports=[
 ['an import of an implementation','import { browserRemote } from "../host/browser-presence";'],
 ['an import of an implementation, deeper','import { parseBrowser } from "../../host/identity";'],
 ['an import of an implementation with its extension','import { pageVoice } from "../host/browser-voice.js";'],
 ['an import of the native reader','import { nativeHost } from "../host/native";'],
 ['an import of the microphone','import { pageMicrophone } from "../host/browser-microphone.ts";'],
 ['an import of types from an implementation','import type { NativeHost } from "../host/native";'],
 ['an import for its effect','import "../host/browser-presence";'],
 ['a re-export of an implementation','export { browserRemote } from "../host/browser-presence";'],
 ['a re-export of everything','export * from "../host/native";'],
 ['a re-export under a name','export * as native from "../host/native";'],
 ['a dynamic import','const m = await import("../host/browser-presence");'],
 ['a dynamic import with its extension','const m = import("../host/browser-voice.js");'],
 ['a type that names the module','type Native = import("../host/native").NativeHost;'],
 ['the harness\'s helper, in feature code','import { installApp } from "../host/testing";'],
 ['require','const m = require("../host/browser-presence");'],
 ['require of the native reader, with its extension','const { nativeHost } = require("../../host/native.ts");'],
 ['a glob of the host\'s files','const all = import.meta.glob("../host/*.ts");'],
 ['a glob of one implementation, eager','const one = import.meta.glob(["../host/native.ts"], { eager: true });'],
 ['a glob with a type argument','const all = import.meta.glob<unknown>("../host/**", { eager: true });'],
 ['an eager glob','const all = import.meta.globEager("../host/browser-*.ts");'],
];
// The host has no `os` (D-HOST-OS): nothing outside it asks which system the page runs on, and nothing OS-shaped is imported from it.
const system=[
 ['identity.os read','const os = host().identity.os;'],
 ['identity.os, optional','const os = host()?.identity?.os;'],
 ['identity.os, bracketed','const os = host().identity["os"];'],
 ['identity.platform','const where = host().identity.platform;'],
 ['os taken out of the identity','const { os } = host().identity;'],
 ['os taken out of the identity, renamed','const { os: system } = host().identity;'],
 ['os taken out of the identity, by a string key','const { "os": system } = host().identity;'],
 ['identity taken out of the host, os read','const { identity } = host(); const os = identity.os;'],
 // The identity named by a string or a template, and taken apart inside the host's own pattern.
 ['identity.os, identity bracketed','const os = host()["identity"].os;'],
 ['identity.os, both bracketed','const os = host()["identity"]["os"];'],
 ['identity.os, optional and bracketed','const os = host()?.["identity"]?.["os"];'],
 ['identity.platform, identity bracketed','const where = host()["identity"].platform;'],
 ['identity.os, identity in a template','const os = host()[`identity`].os;'],
 ['identity.os, os in a template','const os = host().identity[`os`];'],
 ['identity.platform, both in templates','const where = host()[`identity`][`platform`];'],
 ['os taken out of a bracketed identity','const { os } = host()["identity"];'],
 ['os taken out of an identity in a template','const { os } = host()[`identity`];'],
 ['os taken out of the identity by a template key','const { [`os`]: system } = host().identity;'],
 ['platform taken out of the identity by a computed string key','const { ["platform"]: where } = host().identity;'],
 ['os taken out inside the host\'s pattern','const { identity: { os } } = host();'],
 ['os taken out inside the host\'s pattern, renamed','const { identity: { os: system } } = host();'],
 ['os taken out inside the host\'s pattern, by a string key','const { identity: { "os": system } } = host();'],
 ['platform taken out inside the host\'s pattern','const { identity: { platform } } = host();'],
 ['os taken out inside the host\'s pattern, among others','const { identity: { shortcutModifier, os } } = host();'],
 ['os taken out inside the host\'s pattern, identity by a string key','const { "identity": { os } } = host();'],
 ['os taken out inside the host\'s pattern, identity by a computed string key','const { ["identity"]: { os } } = host();'],
 ['os taken out inside the host\'s pattern, both in templates','const { [`identity`]: { [`os`]: system } } = host();'],
 ['os taken out inside the host\'s pattern, with a default','const { identity: { os } = {} } = host();'],
 ['os taken out inside the host\'s pattern, deeper in it','const { host: { identity: { os } } } = app;'],
 ['os taken out inside the host\'s pattern, in a parameter','const read = ({ identity: { os } }) => os;'],
 ['os taken out inside the host\'s pattern, by an assignment','({ identity: { os } } = host());'],
 ['a test of the system, mac','const mac = host().identity.os === "macos";'],
 ['HostOS imported','import { host, type HostOS } from "../host";'],
 ['HostOS imported from the types','import type { HostOS } from "../host/types";'],
 ['HostOS imported from the index','import { HostOS } from "../../host/index.ts";'],
 ['HostOS re-exported','export type { HostOS } from "../host";'],
 ['HostOS named by an import type','type System = import("../host").HostOS;'],
 ['a Platform of the host','import type { Platform } from "../host";'],
 ['a name ending in OS','import type { BrowserOS } from "../host";'],
 ['a name ending in Platform','import { hostPlatform } from "../host";'],
 ['the browser reading','import { describeBrowser } from "../host";'],
 ['the browser parser','import { parseBrowser } from "../host/index";'],
 ['isMac','import { isMac } from "../host";'],
 ['isMac, from a component','import { isMac } from "../host/types";'],
];
const lintFixtures=[
 ['which system the page runs on',system],
 ['the global an app injects',injected],
 ['the browser\'s navigator, held, aliased, passed, destructured or read beyond what is not the host\'s',navigator],
 ['the microphone\'s stream',microphone],
 ['what is behind host()',imports],
];
// Files other than .js and .ts are held to it too: CommonJS and ES modules named by their extension.
test('CommonJS and .mjs files are held to it as the rest are',async()=>{
 for(const filename of ['src/services/example.cjs','src/services/example.mjs']){
  assert.ok((await lint('const n = navigator;',filename)).length>0,filename+' alias');
  assert.ok((await lint('const a = globalThis.navigator?.wakeLock;',filename)).length>0,filename+' member');
  assert.ok((await lint('const host = window.__sidevoiceHost;',filename)).length>0,filename+' global');
  assert.ok((await lint('await media.getUserMedia({ audio: true });',filename)).length>0,filename+' microphone');
  assert.deepEqual(await lint('await navigator.clipboard.writeText(text);',filename),[],filename+' allowed');
 }
 assert.ok((await lint('const m = require("../host/native");','src/services/example.cjs')).length>0);
 assert.deepEqual(await lint('const { host } = require("../host");','src/services/example.cjs'),[]);
 assert.deepEqual(await lint('const n = navigator;','src/services/example.test.cjs'),[],'a test is not');
});
for(const [group,fixtures] of lintFixtures){
 test('Outside src/host, '+group+' is refused in every form seen',async()=>{
  for(const [name,code] of fixtures){
   const messages=await lint(code,OUTSIDE);
   assert.ok(messages.length>0,name+': '+code);
  }
 });
}
test('Each refusal says where to go',async()=>{
 assert.match((await lint('window.__sidevoiceHost',OUTSIDE))[0],/host\(\)/);
 assert.match((await lint('navigator.userAgent',OUTSIDE))[0],/host\(\)/);
 assert.match((await lint('const n = navigator;',OUTSIDE))[0],/host\(\)/);
 assert.match((await lint('media.getUserMedia',OUTSIDE))[0],/host\(\)/);
 assert.match((await lint('import { x } from "../host/native";',OUTSIDE))[0],/host\(\)/);
});
test('A refusal is one report, not one for every way the rule could see the same thing',async()=>{
 assert.equal((await lint('const a = window.navigator.userAgent;',OUTSIDE)).length,1);
 assert.equal((await lint('const a = navigator.userAgent;',OUTSIDE)).length,1);
 assert.equal((await lint('const { userAgent } = navigator;',OUTSIDE)).length,1);
 assert.equal((await lint('const a = window.clientInformation.userAgent;',OUTSIDE)).length,1);
 assert.equal((await lint('const a = window[`navigator`].userAgent;',OUTSIDE)).length,1);
 assert.equal((await lint('const a = window[`navigator`][`userAgent`];',OUTSIDE)).length,1);
 assert.equal((await lint('const { clientInformation } = window;',OUTSIDE)).length,1);
 assert.equal((await lint('const a = host()["identity"].os;',OUTSIDE)).length,1);
 assert.equal((await lint('const { identity: { os } } = host();',OUTSIDE)).length,1);
 assert.equal((await lint('const { identity: { os, platform } } = host();',OUTSIDE)).length,2,'one for each of the two taken out');
});
test('JavaScript and TSX are held to it as TypeScript is',async()=>{
 assert.ok((await lint('const a = globalThis.navigator?.wakeLock;','src/services/example.js')).length>0);
 assert.ok((await lint('const n = window.navigator;','src/services/example.js')).length>0);
 assert.ok((await lint('import { browserRemote } from "../host/browser-presence.ts";','src/services/example.js')).length>0);
 assert.ok((await lint('export const A = () => <b>{navigator.userAgent}</b>;','src/features/Example.tsx')).length>0);
});
test('src/host is the only place that names them, and the tests that stand in for an app are not held to it',async()=>{
 const all=[...injected,...navigator,...microphone,...imports,...system];
 for(const [name,code] of all){
  assert.deepEqual(await lint(code,'src/host/example.ts'),[],'inside the host: '+name);
  assert.deepEqual(await lint(code,'src/features/example.test.tsx'),[],'a test: '+name);
  assert.deepEqual(await lint(code,'src/features/settings/with-microphone.test-util.ts'),[],'a test utility: '+name);
 }
});
test('A name that only looks like the system is not refused: a machine\'s platform, an icon, what the host does give',async()=>{
 const fine=[
  'const where = machine.platform;',
  'const row = { os: "linux" }; const a = row.os;',
  'const { os } = machine;',
  'const a = host().identity.shortcutModifier;',
  'const a = host().identity.deviceName();',
  'const a = host()["identity"].shortcutModifier;',
  'const a = host()[`identity`][`deviceName`]();',
  'const { shortcutModifier, deviceName } = host().identity;',
  'const { identity: { shortcutModifier } } = host();',
  'const { identity: { deviceName, shortcutModifier } = fallback } = host();',
  'const { [`identity`]: { shortcutModifier } } = host();',
  'const { identity } = host(); const key = identity.shortcutModifier;',
  'const where = machine[`platform`];',
  'const where = machine["os"];',
  'const { machine: { os } } = row;',
  'const { host: { platform } } = row;',
  'const { identities: { os } } = row;',
  'const row = { ["identity"]: { os: "linux" }, [`platform`]: "macos" };',
  'const help = host().microphone.help("es");',
  'import { PlatformIcon } from "../components/ui/Icons";',
  'import { host, type Host, type MicrophoneHelp } from "../host";',
  'import type { HostIdentity, HostMicrophone } from "../host/types";',
  'import { isMachine, osOfMachine } from "../services/machines";',
  'export type { Host } from "../host";',
  'type Help = import("../host").MicrophoneHelp;',
 ];
 for(const code of fine)assert.deepEqual(await lint(code,OUTSIDE),[],code);
});
test('What the page reads of navigator that is not a host\'s passes: its clipboard, language, storage, devices and permissions',async()=>{
 const fine=[
  'await navigator.clipboard.writeText(text);',
  'if (!navigator.clipboard?.writeText) throw new Error("unavailable");',
  'const ok = typeof navigator.clipboard?.writeText === "function";',
  'await globalThis.navigator?.clipboard?.writeText(text);',
  'const asked = globalThis.navigator?.languages ?? [globalThis.navigator?.language];',
  'const storage = globalThis.navigator?.storage ?? null;',
  'const devices = win.navigator?.mediaDevices;',
  'const list = await navigator.mediaDevices.enumerateDevices();',
  'window.navigator?.mediaDevices?.addEventListener?.("devicechange", run);',
  'window.navigator?.permissions?.query?.({ name: "microphone" });',
  'const memory = globalThis.navigator?.deviceMemory;',
  'const gpu = globalThis.navigator?.gpu ? 1 : 0;',
  'const cores = globalThis.navigator.hardwareConcurrency;',
  'await navigator["clipboard"].writeText(text);',
  // A template with nothing interpolated is the name it spells, as a string is; and clientInformation is the navigator.
  'await navigator[`clipboard`].writeText(text);',
  'const asked = window.navigator?.[`languages`];',
  'const storage = window[`navigator`]?.storage;',
  'await globalThis[`navigator`][`clipboard`].writeText(text);',
  'await window["navigator"]["clipboard"].writeText(text);',
  'await clientInformation.clipboard.writeText(text);',
  'await window.clientInformation?.clipboard?.writeText(text);',
  'const asked = self[`clientInformation`]?.languages;',
  'const devices = globalThis["clientInformation"].mediaDevices;',
  'if (!clientInformation.clipboard?.writeText) throw new Error("unavailable");',
 ];
 for(const code of fine)assert.deepEqual(await lint(code,OUTSIDE),[],code);
});
test('Nothing else is refused: the same names on something that is not the host\'s, and the imports the host gives',async()=>{
 const fine=[
  'const icon = <PlatformIcon platform="linux" />;',
  'const where = machine.platform;',
  'const row = { platform: "macos", userAgent: "kept for the report" };',
  'function name(nav) { return nav?.platform; }',
  'function run(window) { return window.sidevoiceUI?.store; }',
  'const stream = await getUserMediaStream();',
  'media?.addEventListener?.("devicechange", onChange);',
  'const lock = ownLock.release();',
  'const known = "mediaSessionLike" in table;',
  'import { host } from "../host";',
  'import { host } from "../../host/index.ts";',
  'import { host as theHost } from "../host/index";',
  'import type { Host, MicrophoneBridge } from "../host/types";',
  'export type { Host } from "../host/types";',
  'const loaded = await import("../host");',
  'type Status = import("../host").LocalHostStatus;',
  'import { hostAgents } from "../services/host-agents";',
  'import { x } from "../hosts/machine";',
  'import { y } from "./host-view";',
  'const { host } = require("../host");',
  'const { host } = require("../host/index.js");',
  'const all = import.meta.glob<unknown>("./locales/*.ts", { eager: true });',
  'const index = import.meta.glob("../host/index.ts");',
  'const other = require("../services/host-agents");',
 ];
 for(const code of fine)assert.deepEqual(await lint(code,OUTSIDE),[],code);
});
test('A name that is not the global navigator is not refused: a key, a method, a binding that shadows it',async()=>{
 const fine=[
  'const menu = { navigator: "menu" };',
  'const menu = { navigator() { return 1; } };',
  'class Menu { navigator = 1; navigator2() {} }',
  'interface Shell { navigator: string }',
  'type Shell = { navigator: string };',
  'function open(navigator) { return navigator.userAgent; }',
  'const open = (navigator) => navigator.platform;',
  'function open(navigator) { return { navigator }; }',
  'const navigator = makeNavigator(); const a = navigator.userAgent;',
  'function open() { const navigator = fake(); return navigator.wakeLock; }',
  'for (const navigator of navigators) run(navigator);',
  'try { run(); } catch (navigator) { report(navigator); }',
  'import { navigator } from "./menu"; run(navigator.userAgent);',
  // clientInformation, as a key or a binding of something else.
  'const menu = { clientInformation: "menu" };',
  'const menu = { [`navigator`]: "menu", ["clientInformation"]: "menu" };',
  'class Menu { clientInformation = 1; }',
  'type Shell = { clientInformation: string };',
  'function open(clientInformation) { return clientInformation.userAgent; }',
  'const clientInformation = makeInformation(); const a = clientInformation.platform;',
  'try { run(); } catch (clientInformation) { report(clientInformation); }',
  'import { clientInformation } from "./menu"; run(clientInformation.userAgent);',
  'const a = machine[`userAgent`];',
  'const a = nav?.["platform"];',
  'const a = nav[`userAgentData`];',
  'const row = { ["userAgent"]: "kept for the report", [`platform`]: "macos" };',
 ];
 for(const code of fine)assert.deepEqual(await lint(code,OUTSIDE),[],code);
 // And the global still is, in the same file as a shadow.
 assert.equal((await lint('function open(navigator) { return navigator.userAgent; }\nconst a = navigator.userAgent;',OUTSIDE)).length,1);
 assert.equal((await lint('{ const navigator = fake(); }\nconst b = navigator;',OUTSIDE)).length,1);
});
test('The dev harness and the helpers tests share inject through host/testing, and take nothing else of the host\'s',async()=>{
 const harness='import { installApp, installedMembers } from "../host/testing";';
 assert.deepEqual(await lint(harness,'src/journeys/main.tsx'),[]);
 assert.deepEqual(await lint(harness,'src/test/updater.ts'),[]);
 assert.ok((await lint(harness,'src/features/example.ts')).length>0,'feature code does not');
 assert.ok((await lint('import { nativeHost } from "../host/native";','src/journeys/main.tsx')).length>0);
 assert.ok((await lint('import { nativeHost } from "../host/native";','src/test/updater.ts')).length>0);
 assert.ok((await lint('const a = navigator.userAgent;','src/journeys/main.tsx')).length>0,'and the rest is theirs too');
});
test('There is no switching it off from the code that is held to it',async()=>{
 const messages=await lint('// eslint-disable-next-line no-restricted-syntax\nconst a = navigator.userAgent;',OUTSIDE);
 assert.ok(messages.some(m=>/host\(\)/.test(m)),'the comment does not lift it');
 const block=await lint('/* eslint-disable */\nconst host = window.__sidevoiceHost;',OUTSIDE);
 assert.ok(block.some(m=>/host\(\)/.test(m)));
 const imported=await lint('// eslint-disable-next-line no-restricted-imports\nimport { x } from "../host/native";',OUTSIDE);
 assert.ok(imported.some(m=>/host\(\)/.test(m)));
});
