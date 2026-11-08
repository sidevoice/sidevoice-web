const fs=require("node:fs"),test=require("node:test"),assert=require("node:assert/strict");

const callCss=fs.readFileSync(__dirname+"/../src/styles/call.css","utf8").replace(/\s+/g," ");

test("nothing of an avatar moves under reduced motion",()=>{
 assert.match(callCss,/@media \(prefers-reduced-motion:reduce\) \{ \.sv-avatar,\.sv-avatar \*,\.stage-spinner \{ animation:none !important;transition:none !important \}/);
});

test("the agent's mouth takes each reading of the speaker's level as it comes, with no transition retargeted thirty times a second",()=>{
 const bare=callCss.replace(/\/\*.*?\*\//g,"");
 const rules=[...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
 const playback=rules.filter(rule=>/data-mouth=playback\]/.test(rule.selector)&&/\.m-open$/.test(rule.selector)&&!/prefers-reduced/.test(rule.selector));
 assert.ok(playback.length>=2,"the mouth at rest and the mouth following the level");
 const following=playback.find(rule=>/data-mouth-active/.test(rule.selector));
 assert.match(following.body,/transform:scaleY\(calc\(\.2 \+ var\(--mouth, 0\) \* \.8\)\)/);
 for(const rule of playback)assert.doesNotMatch(rule.body,/transition:\s*transform/,rule.selector);
});
