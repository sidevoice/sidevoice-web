const fs=require("node:fs"),path=require("node:path"),test=require("node:test"),assert=require("node:assert/strict");

/* Under the finger as an app: no hover that sticks after a tap, no grey flash, no page rubber band, no text selection on
 * the chrome. The call card (a desktop window) and the design system's pages are not the phone's, and keep their own. */

const src=path.join(__dirname,"../src");
const NOT_THE_PHONES=[/^call-controls\//,/^design-system\//];
function cssFiles(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?cssFiles(full):entry.name.endsWith(".css")?[full]:[];
 });
}

/** Every selector that names :hover and is not inside an @media (hover: hover), with its file and line. */
function unguardedHovers(file){
 const text=fs.readFileSync(file,"utf8").replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g," "));
 const found=[],stack=[];let buffer="",line=1,start=1;
 for(const char of text){
  if(char==="\n")line++;
  if(char==="{"){
   const selector=buffer.trim().replace(/\s+/g," ");
   if(/:hover/.test(selector)&&!stack.some(outer=>/hover:\s*hover/.test(outer)))found.push(`${path.relative(src,file)}:${start} ${selector}`);
   stack.push(selector);buffer="";continue;
  }
  if(char==="}"){stack.pop();buffer="";continue;}
  if(char===";"){buffer="";continue;}
  if(!buffer.trim())start=line;
  buffer+=char;
 }
 return found;
}

test("a hover style never sticks after a tap: every :hover is under @media (hover: hover)",()=>{
 const files=cssFiles(src).filter(file=>!NOT_THE_PHONES.some(skip=>skip.test(path.relative(src,file).split(path.sep).join("/"))));
 assert.deepEqual(files.flatMap(unguardedHovers),[]);
});

const app=fs.readFileSync(path.join(src,"styles/app.css"),"utf8").replace(/\s+/g," ");

test("the page takes no tap highlight, no rubber band and no text inflation",()=>{
 assert.match(app,/html \{ -webkit-tap-highlight-color: transparent; overscroll-behavior: none; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; \}/);
});

test("where nothing hovers, the chrome is not selectable and what is typed or said is",()=>{
 const touch=/@media \(hover: none\) and \(pointer: coarse\) \{(.*?)\}\s*\}/.exec(app);
 assert.ok(touch,"a block for touch screens");
 assert.match(touch[1],/body \{ -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; \}/);
 assert.match(touch[1],/:is\(input, textarea, [^)]*\.chat-bubble[^)]*\) \{ -webkit-user-select: text; user-select: text;/);
});
