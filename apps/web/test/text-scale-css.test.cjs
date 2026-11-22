const fs=require("node:fs"),path=require("node:path"),test=require("node:test"),assert=require("node:assert/strict");

/* The type follows the phone's text size (lib/text-scale.ts says it as --sv-text-scale on the root): the tokens are
 * base × scale, a phone's bases are 17/15/13px, the root's font-size (every rem) does not follow, and no UI text sets a
 * size of its own that the scale does not reach. */

const src=path.join(__dirname,"../src");
const theme=fs.readFileSync(path.join(src,"styles/theme.css"),"utf8");
function cssFiles(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?cssFiles(full):entry.name.endsWith(".css")?[full]:[];
 });
}

test("each type token is its base times the text scale, 1 when nothing says it",()=>{
 for(const size of ["xs","sm","md","lg","xl","2xl"]){
  assert.match(theme,new RegExp(`--sv-font-${size}: calc\\(var\\(--sv-font-${size}-base\\) \\* var\\(--sv-text-scale, 1\\)\\);`),size);
 }
});

test("the desktop's bases are the ones drawn before the scale (a rem is 15px)",()=>{
 const base=name=>theme.match(new RegExp(`--sv-font-${name}-base: ([^;]+);`))[1];
 assert.deepEqual(["xs","sm","md","lg","xl","2xl"].map(base),[".75rem",".8125rem",".9375rem","1.0625rem","1.25rem","1.625rem"]);
});

test("a phone's bases are 13, 15 and 17px, and its line heights step with them",()=>{
 const phone=theme.match(/@media \(pointer: coarse\) and \(max-width: 767px\)[^{]*\{\s*:root \{([^}]*)\}/);
 assert.ok(phone,"the phone's block");
 assert.match(phone[1],/--sv-font-xs-base: 13px;/);
 assert.match(phone[1],/--sv-font-sm-base: 15px;/);
 assert.match(phone[1],/--sv-font-md-base: 17px;/);
 assert.match(phone[1],/--sv-line-step: 1\.12;/);
 assert.match(theme,/--sv-line-k: calc\(var\(--sv-text-scale, 1\) \* var\(--sv-line-step\)\);/);
});

test("the root's font-size is fixed: it does not follow the scale, or rem spacing would grow",()=>{
 const root=[...theme.matchAll(/(^|\n)(:root, :root\[data-theme\]) \{ font-size: ([^;]+); \}/g)];
 assert.equal(root.length,1);
 assert.equal(root[0][3],".9375rem");
});

test("the stage's text follows the scale only a little",()=>{
 assert.match(theme,/--sv-stage-text-scale: clamp\(\.9, var\(--sv-text-scale, 1\), 1\.25\);/);
});

/* Exceptions: a size that is not UI text (a drawing's glyph), or sized by the stage's own units (call-view.css's --fs) or
 * by the call card's own window, which does not read the scale. */
const NOT_SCALED=[/^call-controls\//,/^model-picker-lab\//,/^styles\/bichos\.css$/,/^styles\/theme\.css$/,/^features\/call\/stage-voice\.css$/];

test("no UI text sets a px or rem size the scale does not reach",()=>{
 const bare=[];
 for(const file of cssFiles(src)){
  const rel=path.relative(src,file);
  if(NOT_SCALED.some(re=>re.test(rel)))continue;
  const text=fs.readFileSync(file,"utf8").replace(/\/\*[\s\S]*?\*\//g,"");
  for(const m of text.matchAll(/(^|[\s;{])font-size:\s*([^;}]+)/g)){
   const value=m[2].trim();
   if(/^-?[\d.]+(px|rem)$/.test(value))bare.push(`${rel}: font-size: ${value}`);
   if(/^clamp\(/.test(value)&&!/--u\b/.test(value))bare.push(`${rel}: font-size: ${value}`);
  }
  for(const m of text.matchAll(/(^|[\s;{])font:\s*([^;}]+)/g)){
   const value=m[2].trim();
   if(/(^|\s)[\d.]+(px|rem)(\s|\/|$)/.test(value)&&!/system-ui|Georgia/.test(value))bare.push(`${rel}: font: ${value}`);
  }
 }
 assert.deepEqual(bare,[]);
});

test("a fixed height on text is a minimum: a row, button, input or chip grows with its text",()=>{
 const ui=fs.readFileSync(path.join(src,"components/ui/ui.css"),"utf8");
 for(const selector of [".ui-input, .ui-select",".ui-segmented",".ui-segmented--sm",".ui-button--sm",".ui-button--lg"]){
  const rule=ui.split("\n").find(line=>line.startsWith(selector+" {"));
  assert.ok(rule,selector);
  assert.doesNotMatch(rule,/(^|[\s;{])height:/,selector);
 }
});

test("the short-landscape clause is a landscape phone's only: a width cap",()=>{
 assert.match(theme,/\(pointer: coarse\) and \(max-height: 500px\) and \(max-width: 950px\)/);
});

test("a touch input is 16px at least (a rem is 15px) and the body's size where that is more",()=>{
 const floors=[];
 for(const file of cssFiles(src)){
  const text=fs.readFileSync(file,"utf8");
  for(const m of text.matchAll(/@media \(any-pointer: coarse\) \{[^}]*font-size: ([^;}]+)/g))floors.push([path.relative(src,file),m[1].trim()]);
 }
 assert.ok(floors.length>=6,"the touch overrides: "+floors.length);
 for(const [file,value] of floors)assert.match(value,/^max\(16px, var\(--sv-font-md\)\)$/,file);
 assert.doesNotMatch(fs.readFileSync(path.join(src,"features/conversation/transcript.css"),"utf8"),/max\(1rem/);
});

test(".sv-text-* line heights grow with the scale, like the tokens",()=>{
 const rules=[...theme.matchAll(/\n\.sv-text-(\w+) \{([^}]*)\}/g)];
 assert.equal(rules.length,6);
 for(const [,size,body] of rules)assert.match(body,/line-height: calc\([\d.]+rem \* var\(--sv-line-k, 1\)\)/,size);
});

test("the stage's Cancel follows the stage's capped scale",()=>{
 const view=fs.readFileSync(path.join(src,"features/call/call-view.css"),"utf8");
 assert.match(view,/\.cancel-input \{[^}]*font-size: calc\(clamp\(13px, calc\(15 \* var\(--u\)\), 18px\) \* var\(--sv-stage-text-scale, 1\)\)/);
});
