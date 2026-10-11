const fs=require("node:fs"),test=require("node:test"),assert=require("node:assert/strict");
const css=fs.readFileSync(__dirname+"/../src/styles/react.css","utf8").replace(/\s+/g," ");

test("the chat width is contained at every layout boundary",()=>{
 assert.match(css,/#root > .room-shell > main \{[^}]*max-width: 100%;[^}]*min-width: 0;/);
 assert.match(css,/\.transcript \{[^}]*max-width:100%;min-width:0/);
 assert.match(css,/\.message-viewport-wrap>#messages \{[^}]*max-width:100%;min-width:0;[^}]*overflow-x:hidden/);
 assert.match(css,/\.message-group \{[^}]*max-width:100%;min-width:0/);
 assert.match(css,/\.chat-message-row \{[^}]*max-width:100%;min-width:0/);
 assert.match(css,/\.chat-bubble \{[^}]*min-width:0;[^}]*overflow-wrap:anywhere;word-break:break-word/);
});

const roomCss=fs.readFileSync(__dirname+"/../src/styles/room.css","utf8").replace(/\s+/g," ");

const callCss=fs.readFileSync(__dirname+"/../src/styles/call.css","utf8").replace(/\s+/g," ");
const narrow=callCss.slice(callCss.indexOf("@media (max-width:899px)"));
/** The declarations of the first rule for `selector` in `text`, in whatever order they are written. */
function rule(text,selector){const at=text.indexOf(selector+" {");assert.ok(at>=0,selector);return text.slice(at+selector.length+2,text.indexOf("}",at))}

test("the call view is laid out in call.css alone, and on a phone the conversations and the transcript leave the row",()=>{
 // react.css used to place the columns from a selector that named the root and therefore always won.
 assert.doesNotMatch(css,/@media \(max-width: 750px\)[\s\S]*?#root > .room-shell > main \{[^}]*grid-template-columns/);
 assert.doesNotMatch(roomCss,/grid-template-columns:62px/);
 // A phone: the conversations drop from the header only while open, and the transcript rises as a sheet.
 assert.match(rule(narrow,"#root .conversation-sidebar"),/position:fixed/);
 assert.match(rule(narrow,"#root .conversation-sidebar"),/visibility:hidden/);
 assert.match(rule(narrow,"#root .conversation-sidebar[data-open]"),/visibility:visible/);
 assert.match(rule(narrow,"#root > .room-shell > main.call-layout > .transcript,#root > .room-shell > main.call-layout > .transcript:not([data-open])"),/position:fixed/);
 // A desktop: a closed transcript takes no room beside the stage.
 assert.match(rule(callCss,"#root > .room-shell > main.call-layout > .transcript:not([data-open])"),/display:none/);
});

test("nothing of an avatar moves under reduced motion",()=>{
 assert.match(callCss,/@media \(prefers-reduced-motion:reduce\) \{ \.sv-avatar,\.sv-avatar \*,\.stage-spinner \{ animation:none !important;transition:none !important \}/);
});

test("the settings dialog keeps one stable viewport and one scrolling content pane",()=>{
 assert.match(css,/\.settings-dialog\[open\] \{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto;[^}]*height:min\(52rem,calc\(100dvh - 2rem\)\);[^}]*overflow:hidden/);
 assert.match(css,/\.settings-dialog \.settings-content \{[^}]*min-width:0;min-height:0;[^}]*overflow:auto/);
 assert.match(css,/\.settings-dialog \.model-picker \{[^}]*grid-template-columns:minmax\(0,1fr\) 2\.65rem;[^}]*overflow:hidden/);
});

test("settings controls reflow without overflowing on narrow screens",()=>{
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-nav \{[^}]*flex-wrap:wrap;[^}]*overflow:visible/);
 assert.match(css,/@media \(max-width:700px\)[\s\S]*?\.settings-dialog \.settings-footer \{[^}]*flex-wrap:wrap/);
 assert.match(css,/\.host-action-list \{[^}]*display:flex;flex-wrap:wrap/);
 assert.match(css,/grid-template-areas:"name name name" "model model model" "voice speed preview"/);
 assert.match(css,/@media \(max-width:430px\)[\s\S]*?grid-template-areas:"name name" "model model" "voice voice" "speed preview"/);
});

test("the recording bubble is the waveform and cancelling sits inside it, on its own line",()=>{
 assert.match(css,/\.voice-wave\{[^}]*display:block/);
 assert.match(css,/\.voice-wave canvas\{[^}]*width:100%;height:100%/);
 assert.match(css,/\.voice-wave\[data-phase=transcribing\] canvas\{[^}]*animation:voice-wave-rest/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.voice-bars i\{animation:none/);
 assert.match(css,/\.cancel-input\{[^}]*display:block;margin:\.3rem 0 0 auto;[^}]*border:0;[^}]*color:#ffb4ab/);
});
