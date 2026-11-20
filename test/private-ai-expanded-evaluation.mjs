// Requires local Vite :5187 and an isolated Chrome CDP profile :9337 with the model already installed. Uses synthetic prompts only.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const cdpPort = process.env.CDP_PORT || '9337';
const evidencePath = process.env.EVIDENCE_PATH || 'docs/validation/private-ai-chrome-2026-11-19.json';
const tab = await (await fetch('http://127.0.0.1:'+cdpPort+'/json/new?about:blank', {method:'PUT'})).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', event => { const msg = JSON.parse(event.data); if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || '')); });
const send = (method, params = {}) => new Promise((resolve,reject) => { const seq = ++id; pending.set(seq, msg => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)); ws.send(JSON.stringify({id:seq,method,params})); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', {expression: "(async()=>{return " + expression + "})()", awaitPromise:true, returnByValue:true}); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', {url:'http://127.0.0.1:5187/'});
await new Promise(resolve => setTimeout(resolve,2000));
const pause=ms=>new Promise(r=>setTimeout(r,ms));

const report={browser:await send('Browser.getVersion'),repairs:[],responses:[],repetitions:3};
try{
 await evaluate("window.evalProvider=new (await import('/src/services/ai/providers/ChromeBuiltInProvider.js')).ChromeBuiltInProvider({timeoutMs:45000,downloadTimeoutMs:45000})");
 await evaluate("await evalProvider.initialize()");
 assert.equal(await evaluate("evalProvider.isReady()"),true);
 report.contextWindow=await evaluate("evalProvider.models[0].contextWindow");
 await evaluate("window.expandedCases=await import('/test/private-ai-expanded-cases.js')");
 for(let repetition=1;repetition<=3;repetition++){
  for(let index=0;index<10;index++){
   const row=await evaluate("(async()=>{const c=expandedCases.expandedRepairs["+index+"];const {repairWithNano,repairWithRules}=await import('/src/services/ai/documentRepair.js');const started=performance.now();let raw=null;const adapter={isReady:()=>evalProvider.isReady(),repairJSON:async(...args)=>{const r=await evalProvider.repairJSON(...args);raw=r.text;return r}};const row={...c};try{row.output=await repairWithNano(c.input,{type:'JSON'},{provider:'chrome-nano'},{provider:adapter});row.accepted=true}catch(e){row.accepted=false;row.error=e.message}row.raw=raw;row.latencyMs=Math.round(performance.now()-started);try{row.rulesOutput=await repairWithRules(c.input,{type:'JSON'})}catch(e){row.rulesError=e.message}return row})()");
   row.repetition=repetition;
   const tokens=text=>JSON.stringify(text.match(/"(?:[^"\\]|\\.)*"|[^\s"{}\[\],:]+|[{}\[\],:]/g));
   row.matchesExpected=row.accepted && !!row.expected && tokens(row.output)===tokens(row.expected);
   row.outcome=row.mustRefuse?(row.accepted?'unexpected-acceptance':'expected-refusal'):(row.accepted?(row.matchesExpected?'correct':'incorrect'):'refused');
   report.repairs.push(row);console.log(row.id,repetition,row.outcome);
   writeFileSync('docs/validation/private-ai-expanded-2026-11-19.json',JSON.stringify(report,null,2)+'\n');
  }
  for(let index=0;index<3;index++){
   const row=await evaluate("(async()=>{const c=expandedCases.expandedResponses["+index+"];const start=performance.now();try{const r=await evalProvider.complete({...c,prompt:'Explain the document'});return {id:c.id,name:c.name,text:r.text,metadata:r.metadata,latencyMs:Math.round(performance.now()-start)}}catch(e){return {id:c.id,error:e.message}}})()");
   row.repetition=repetition;row.review='pending-manual-review';report.responses.push(row);console.log(row.id,repetition,row.text||row.error);
   writeFileSync('docs/validation/private-ai-expanded-2026-11-19.json',JSON.stringify(report,null,2)+'\n');
  }
 }
}finally{
 await evaluate("await window.evalProvider?.cleanup()").catch(()=>{});
 await send('Page.close');ws.close();
}
