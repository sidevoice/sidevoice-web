const fs=require("node:fs"),test=require("node:test"),assert=require("node:assert/strict");
const css=fs.readFileSync(__dirname+"/../src/styles/react.css","utf8").replace(/\s+/g," ");

test("the chat width is contained at every layout boundary",()=>{
 assert.match(css,/#root > main \{[^}]*max-width: 100%;[^}]*min-width: 0;/);
 assert.match(css,/\.transcript \{[^}]*max-width:100%;min-width:0/);
 assert.match(css,/\.message-viewport-wrap>#messages \{[^}]*max-width:100%;min-width:0;[^}]*overflow-x:hidden/);
 assert.match(css,/\.message-group \{[^}]*max-width:100%;min-width:0/);
 assert.match(css,/\.chat-message-row \{[^}]*max-width:100%;min-width:0/);
 assert.match(css,/\.chat-bubble \{[^}]*min-width:0;[^}]*overflow-wrap:anywhere;word-break:break-word/);
});

const roomCss=fs.readFileSync(__dirname+"/../src/styles/room.css","utf8").replace(/\s+/g," ");
const agentsCss=fs.readFileSync(__dirname+"/../src/features/settings/host-agents.css","utf8").replace(/\s+/g," ");

test("on a phone the conversations keep a rail of their own and the transcript keeps a column that can shrink",()=>{
 // Where the columns go on a phone is said once, in room.css. react.css used to say it too, from a
 // selector that named the root and therefore always won, which is how the rail kept disappearing.
 assert.doesNotMatch(css,/@media \(max-width: 750px\)[\s\S]*?#root > main \{[^}]*grid-template-columns/);
 assert.match(roomCss,/@media\(max-width:750px\)\{ main\{grid-template-columns:62px minmax\(0,1fr\)/);
});


test("the settings dialog keeps one stable viewport and one scrolling content pane",()=>{
 assert.match(css,/\.settings-dialog\[open\] \{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto;[^}]*height:min\(52rem,calc\(100dvh - 2rem\)\);[^}]*overflow:hidden/);
 assert.match(css,/\.settings-dialog \.settings-content \{[^}]*min-width:0;min-height:0;[^}]*overflow:auto/);
 assert.match(css,/\.settings-dialog \.model-picker \{[^}]*grid-template-columns:minmax\(0,1fr\) 2\.65rem;[^}]*overflow:hidden/);
});

test("the mobile settings sidebar collapses vertically and leaves the content scrollable",()=>{
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog\[open\] \{[^}]*width:100vw;[^}]*height:100dvh/);
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?#language-settings\.settings-dialog\[open\] \{ inset:0;width:100vw;height:100dvh;max-width:none;max-height:100dvh;margin:0;border-radius:0/);
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-nav \{[^}]*display:none;flex-direction:column;[^}]*max-height:32dvh;overflow:auto/);
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-nav\[data-mobile-open\] \{ display:flex \}/);
 assert.match(css,/\.settings-dialog \.settings-nav-toggle \{ display:none \}/);
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-nav-toggle \{ display:flex/);
 assert.match(css,/\.settings-dialog \.settings-nav \{ display:flex;flex-direction:column/);
 assert.match(css,/\.settings-dialog \.settings-content \{[^}]*min-width:0;min-height:0;[^}]*overflow:auto/);
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-footer \{[^}]*flex-wrap:wrap/);
 assert.match(css,/\.host-action-list \{[^}]*display:flex;flex-wrap:wrap/);
 assert.match(css,/grid-template-areas:"name name name" "model model model" "voice speed preview"/);
 assert.match(css,/@media \(max-width:430px\)[\s\S]*?grid-template-areas:"name name" "model model" "voice voice" "speed preview"/);
 assert.match(css,/\.host-tabs \{[^}]*flex-wrap:nowrap;[^}]*overflow:auto/);
});

test("the 390×844 and 320×568 layouts keep the drawer, host tabs, and Agents actions usable",()=>{
 const targetWidths=[390,320];
 assert.ok(targetWidths.every(width=>width<=700),'both target phones use the full-screen vertical Settings layout');
 assert.ok(targetWidths.every(width=>width<=550),'both target phones use the wrapped Agents action layout');
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-nav \{[^}]*max-height:32dvh;overflow:auto/);
 assert.match(css,/\.settings-content \{[^}]*min-width:0;min-height:0;[^}]*overflow:auto/);
 assert.match(css,/\.host-tabs \{[^}]*flex-wrap:wrap/);
 assert.match(agentsCss,/@media\(max-width:550px\) \{/);
 assert.match(agentsCss,/\.host-agent-main,.host-agent-other-head \{ align-items:flex-start;flex-wrap:wrap \}/);
 assert.match(agentsCss,/\.host-agent-actions \{ margin-inline-start:2\.25rem;justify-content:flex-start;width:calc\(100% - 2\.25rem\)/);
 assert.match(agentsCss,/\.host-agent-code pre \{[^}]*max-height:16rem;overflow:auto/);
 assert.match(agentsCss,/\.host-agent-code button \{ flex:none;display:flex/);
});

test("the recording bubble is the waveform and cancelling sits inside it, on its own line",()=>{
 assert.match(css,/\.voice-wave\{[^}]*display:block/);
 assert.match(css,/\.voice-wave canvas\{[^}]*width:100%;height:100%/);
 assert.match(css,/\.voice-wave\[data-phase=transcribing\] canvas\{[^}]*animation:voice-wave-rest/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.voice-bars i\{animation:none/);
 assert.match(css,/\.cancel-input\{[^}]*display:block;margin:\.3rem 0 0 auto;[^}]*border:0;[^}]*color:#ffb4ab/);
});
