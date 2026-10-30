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
];
const microphone=[
 ['getUserMedia','await navigator.mediaDevices.getUserMedia({ audio: true });'],
 ['getUserMedia, optional','await media?.getUserMedia?.({ audio: true });'],
 ['getUserMedia through a name','const open = devices.getUserMedia.bind(devices);'],
 ['getUserMedia through an alias of mediaDevices','const m = navigator.mediaDevices; await m.getUserMedia({ audio: true });'],
 ['getUserMedia by brackets','await devices["getUserMedia"]({ audio: true });'],
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
];
const lintFixtures=[
 ['the global an app injects',injected],
 ['the browser\'s navigator, held, aliased, passed, destructured or read beyond what is not the host\'s',navigator],
 ['the microphone\'s stream',microphone],
 ['what is behind host()',imports],
];
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
});
test('JavaScript and TSX are held to it as TypeScript is',async()=>{
 assert.ok((await lint('const a = globalThis.navigator?.wakeLock;','src/services/example.js')).length>0);
 assert.ok((await lint('const n = window.navigator;','src/services/example.js')).length>0);
 assert.ok((await lint('import { browserRemote } from "../host/browser-presence.ts";','src/services/example.js')).length>0);
 assert.ok((await lint('export const A = () => <b>{navigator.userAgent}</b>;','src/features/Example.tsx')).length>0);
});
test('src/host is the only place that names them, and the tests that stand in for an app are not held to it',async()=>{
 const all=[...injected,...navigator,...microphone,...imports];
 for(const [name,code] of all){
  assert.deepEqual(await lint(code,'src/host/example.ts'),[],'inside the host: '+name);
  assert.deepEqual(await lint(code,'src/features/example.test.tsx'),[],'a test: '+name);
  assert.deepEqual(await lint(code,'src/features/settings/with-microphone.test-util.ts'),[],'a test utility: '+name);
 }
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
 ];
 for(const code of fine)assert.deepEqual(await lint(code,OUTSIDE),[],code);
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
