// Same-model two-turn comparison. Direct Node CLI; OAuth/API credentials stay inside Pi/tools.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const variant=process.argv[2];
if(!['baseline','updated'].includes(variant))throw Error('Choose baseline or updated');
const home=homedir();
const ext=variant==='baseline' ? join(home,'sn-rest-backups/2026-09-21T08-54-40-021Z/extension/sn-rest.ts') : join(home,'.pi/agent/extensions/sn-rest.ts');
const dir=join(home,'session-investigations/sn-rest-benchmark',variant+'-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
const cli=join(process.env.APPDATA,'npm/node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
const base=[cli,'--offline','--mode','json','-p','--provider','cerebras','--model','qwen-3.8-27b','--thinking','high',
 '--no-extensions','-e',ext,'-e',join(here,'benchmark-guard.ts'),'--no-skills','--no-context-files','--no-prompt-templates','--no-themes',
 '--tools',variant==='baseline'?'sn_rest':'sn_rest,sn_schema','--no-approve'];
const runs=[];
for(const [i,prompt] of ['Which apps do we have?','Who is working on each?'].entries()){
 const existing=fs.readdirSync(dir).find(n=>n.endsWith('.jsonl'));
 const args=[...base,...(existing?['--session',join(dir,existing)]:['--session-dir',dir,'--name',`sn-rest ${variant} same-model test`]),prompt];
 const started=Date.now();const output=fs.createWriteStream(join(dir,`turn-${i+1}.events.log`));
 const child=spawn(process.execPath,args,{cwd:home,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
 child.stdout.on('data',c=>output.write(c));child.stderr.on('data',c=>output.write(c));
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 clearTimeout(timer);await new Promise(r=>output.end(r));runs.push({prompt,code,timedOut,ms:Date.now()-started});
 if(code!==0||timedOut)break;
}
const file=fs.readdirSync(dir).find(n=>n.endsWith('.jsonl'));
const entries=file?fs.readFileSync(join(dir,file),'utf8').trim().split('\n').map(JSON.parse):[];
const messages=entries.filter(e=>e.message).map(e=>e.message);
const tools=messages.filter(m=>m.role==='toolResult');const assistants=messages.filter(m=>m.role==='assistant');
const text=m=>(Array.isArray(m.content)?m.content:[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
const callCounts={};for(const a of assistants)for(const c of a.content||[])if(c.type==='toolCall')callCounts[c.name]=(callCounts[c.name]||0)+1;
const outcome={variant,dir,sessionId:entries[0]?.id,model:'cerebras/qwen-3.8-27b',thinking:'high',runs,callCounts,
 toolResultChars:tools.reduce((n,t)=>n+text(t).length,0),maxToolResultChars:Math.max(0,...tools.map(t=>text(t).length)),
 compactions:entries.filter(e=>e.type==='compaction').length,providerErrors:assistants.filter(a=>a.stopReason==='error').map(a=>a.errorMessage),
 toolErrors:tools.filter(t=>t.isError).length,lengthStops:assistants.filter(a=>a.stopReason==='length').length,
 firstInputTokens:(()=>{const u=assistants.find(a=>(a.usage?.input||0)+(a.usage?.cacheRead||0)>0)?.usage;return (u?.input||0)+(u?.cacheRead||0);})(),
 peakInputTokens:Math.max(0,...assistants.map(a=>(a.usage?.input||0)+(a.usage?.cacheRead||0))),
 finalAnswers:assistants.filter(a=>a.stopReason==='stop').map(text)};
fs.writeFileSync(join(dir,'metrics.json'),JSON.stringify(outcome,null,2));
console.log(JSON.stringify({...outcome,finalAnswers:outcome.finalAnswers.map(t=>t.slice(0,900))},null,2));
