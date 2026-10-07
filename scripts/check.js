/* Pre-flight check: npm run check */
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs"); const path = require("node:path");
const root = path.join(__dirname, "..");
let ok = true;
const pass=m=>console.log("  \u2714 "+m), fail=m=>{ok=false;console.log("  \u2718 "+m);}, note=m=>console.log("  \u2022 "+m);
console.log("\nNexora Slide Maker \u2014 setup check\n");
const [maj,min]=process.versions.node.split(".").map(Number);
(maj>18||(maj===18&&min>=17))?pass(`Node.js ${process.versions.node}`):fail(`Node.js ${process.versions.node} is too old (need 20+).`);
fs.existsSync(path.join(root,"node_modules","pptxgenjs"))?pass("npm packages installed"):fail("Run: npm install");
for (const f of ["public/pptxgen.bundle.js","public/slides.js","public/mammoth.browser.min.js"])
  fs.existsSync(path.join(root,f))?pass(f.split("/").pop()+" present"):fail(`Missing ${f} — run: npm install`);
// load .env the way the server does
try{for(const l of fs.readFileSync(path.join(root,".env"),"utf8").split(/\r?\n/)){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,"$2").replace(/\s+#.*$/,"");}}catch{}
const provider=(process.env.PROVIDER||"none").toLowerCase();
function has(cmd,args){return new Promise(r=>{try{const c=spawn(cmd,args);c.on("error",()=>r(false));c.on("close",()=>r(true));setTimeout(()=>{try{c.kill("SIGKILL");}catch{}r(false);},8000);}catch{r(false);}});}
(async()=>{
  note(`AI outline drafting: ${provider==="none"?"off (you can still write outlines by hand)":provider}`);
  if(provider==="ollama"){const url=(process.env.OLLAMA_URL||"http://127.0.0.1:11434").replace(/\/+$/,"");try{const j=await(await fetch(url+"/api/tags",{signal:AbortSignal.timeout(4000)})).json();pass("Ollama reachable");const want=process.env.OLLAMA_MODEL||"qwen2.5:7b";(j.models||[]).some(m=>m.name===want||m.name===want+":latest")?pass(`Model ${want} installed`):note(`Model ${want} not pulled yet: ollama pull ${want}`);}catch{fail("PROVIDER=ollama but Ollama isn't reachable.");}}
  else if(provider==="anthropic"){process.env.ANTHROPIC_API_KEY?pass("ANTHROPIC_API_KEY set"):fail("ANTHROPIC_API_KEY empty.");}
  else if(provider==="openai"){process.env.OPENAI_API_KEY?pass("OPENAI_API_KEY set"):note("OPENAI_API_KEY empty (fine for local servers that need no key).");}
  const lo=await has(process.env.SOFFICE_BIN||"soffice",["--version"]);
  lo?pass("LibreOffice \u2014 PDF export ready"):note("LibreOffice not found. PowerPoint works; for PDF export install it: sudo apt install libreoffice");
  console.log(ok?"\nReady. Start with: npm start\n":"\nFix the \u2718 items and re-run.\n");
  process.exit(ok?0:1);
})();
