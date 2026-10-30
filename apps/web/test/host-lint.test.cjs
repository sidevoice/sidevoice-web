const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
// Only src/host names a host mechanism (lint/host-rules.mjs). Each pattern the code has used is a fixture here: the lint is
// as good as the patterns it is shown, and a pattern it misses is a way round the boundary.
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
 ['win.navigator?.userAgentData?.platform','const a = win.navigator?.userAgentData?.platform;'],
 ['a navigator parameter, nav?.platform','function name(nav) { return nav?.platform; }'],
 ['bracket access','const a = navigator["userAgent"];'],
 ['bracket access on window.navigator','const a = window.navigator?.["platform"];'],
 ['userAgentData','const a = navigator.userAgentData;'],
 ['the Media Session','navigator.mediaSession.setActionHandler("play", run);'],
 ['the Media Session, optional','const s = globalThis.navigator?.mediaSession;'],
 ['the wake lock','await navigator.wakeLock.request("screen");'],
 ['the wake lock, optional','if (!globalThis.navigator?.wakeLock?.request) return;'],
 ['the wake lock, tested with in','const has = "wakeLock" in navigator;'],
 ['the audio session','navigator.audioSession.type = "play-and-record";'],
 ['a destructuring of navigator','const { userAgent } = navigator;'],
 ['a destructuring of window.navigator','const { wakeLock, mediaSession: session } = window.navigator;'],
];
const microphone=[
 ['getUserMedia','await navigator.mediaDevices.getUserMedia({ audio: true });'],
 ['getUserMedia, optional','await media?.getUserMedia?.({ audio: true });'],
 ['getUserMedia through a name','const open = devices.getUserMedia.bind(devices);'],
 ['getUserMedia by brackets','await devices["getUserMedia"]({ audio: true });'],
 ['a typeof of it','if (typeof media.getUserMedia === "function") ask();'],
 ['a destructuring of it','const { getUserMedia } = navigator.mediaDevices;'],
 ['a test of it with in','const has = "getUserMedia" in mediaDevices;'],
];
for(const [group,fixtures] of [['the global an app injects',injected],['what the browser says of itself, the Media Session and the wake lock',navigator],['the microphone\'s stream',microphone]]){
 test('Outside src/host, '+group+' is refused in every form the code has used',async()=>{
  for(const [name,code] of fixtures){
   const messages=await lint(code,OUTSIDE);
   assert.ok(messages.length>0,name+': '+code);
  }
 });
}
test('Each refusal says where to go',async()=>{
 assert.match((await lint('window.__sidevoiceHost',OUTSIDE))[0],/host\(\)/);
 assert.match((await lint('navigator.userAgent',OUTSIDE))[0],/host\(\)/);
 assert.match((await lint('media.getUserMedia',OUTSIDE))[0],/host\(\)/);
});
test('JavaScript and TSX are held to it as TypeScript is',async()=>{
 assert.ok((await lint('const a = globalThis.navigator?.wakeLock;','src/services/example.js')).length>0);
 assert.ok((await lint('export const A = () => <b>{navigator.userAgent}</b>;','src/features/Example.tsx')).length>0);
});
test('src/host is the only place that names them, and the tests that stand in for an app are not held to it',async()=>{
 const all=[...injected,...navigator,...microphone];
 for(const [name,code] of all){
  assert.deepEqual(await lint(code,'src/host/example.ts'),[],'inside the host: '+name);
  assert.deepEqual(await lint(code,'src/features/example.test.tsx'),[],'a test: '+name);
  assert.deepEqual(await lint(code,'src/features/settings/with-microphone.test-util.ts'),[],'a test utility: '+name);
 }
});
test('There is no switching it off from the code that is held to it',async()=>{
 const messages=await lint('// eslint-disable-next-line no-restricted-syntax\nconst a = navigator.userAgent;',OUTSIDE);
 assert.ok(messages.some(m=>/host\(\)/.test(m)),'the comment does not lift it');
 const block=await lint('/* eslint-disable */\nconst host = window.__sidevoiceHost;',OUTSIDE);
 assert.ok(block.some(m=>/host\(\)/.test(m)));
});
test('Nothing else is refused: what has the same names but is not a host mechanism passes',async()=>{
 const fine=[
  'const icon = <PlatformIcon platform="linux" />;',
  'const where = machine.platform;',
  'const row = { platform: "macos", userAgent: "kept for the report" };',
  'function run(window) { return window.sidevoiceUI?.store; }',
  'const stream = await getUserMediaStream();',
  'const devices = await navigator.mediaDevices.enumerateDevices();',
  'media?.addEventListener?.("devicechange", onChange);',
  'const lock = ownLock.release();',
  'const known = "mediaSessionLike" in table;',
 ];
 for(const code of fine)assert.deepEqual(await lint(code,OUTSIDE),[],code);
});
