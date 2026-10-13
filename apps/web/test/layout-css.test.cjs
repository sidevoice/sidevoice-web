const fs=require("node:fs"),test=require("node:test"),assert=require("node:assert/strict");

const callCss=fs.readFileSync(__dirname+"/../src/styles/call.css","utf8").replace(/\s+/g," ");

test("nothing of an avatar moves under reduced motion",()=>{
 assert.match(callCss,/@media \(prefers-reduced-motion:reduce\) \{ \.sv-avatar,\.sv-avatar \*,\.stage-spinner \{ animation:none !important;transition:none !important \}/);
});
