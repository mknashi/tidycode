// Requires local Vite :5187 and an isolated Chrome CDP profile :9340 for a fresh download test. Uses synthetic prompts only.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const tab = await (await fetch('http://127.0.0.1:9340/json/new?about:blank', {method:'PUT'})).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', event => { const msg = JSON.parse(event.data); if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || '')); });
const send = (method, params = {}) => new Promise((resolve,reject) => { const seq = ++id; pending.set(seq, msg => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)); ws.send(JSON.stringify({id:seq,method,params})); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', {expression: "(async()=>{return " + expression + "})()", awaitPromise:true, returnByValue:true, userGesture:true}); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', {url:'http://127.0.0.1:5187/'});
await new Promise(resolve => setTimeout(resolve,2000));
const pause=ms=>new Promise(r=>setTimeout(r,ms));

const results = {browser: await send('Browser.getVersion'), checks:[], states:[]};
try {
 await evaluate("window.downloadProvider = new (await import('/src/services/ai/providers/ChromeBuiltInProvider.js')).ChromeBuiltInProvider({downloadTimeoutMs:600000})");
 await evaluate("(async()=>{window.downloadStates=[];downloadProvider.status.subscribe(()=>downloadStates.push({elapsedMs:performance.now(),...downloadProvider.status.getSnapshot()}));await downloadProvider.initialize()})()");
 results.initial=await evaluate("downloadProvider.status.getSnapshot()");
 console.log('Fresh profile:',results.initial);
 results.availabilityRechecks=[];
 for(let i=0;results.initial.state==='error' && i<3;i++){
   await pause(10000);
   await evaluate("await downloadProvider.refreshAvailability()");
   results.initial=await evaluate("downloadProvider.status.getSnapshot()");
   results.availabilityRechecks.push(results.initial);
   console.log('Availability recheck:',results.initial);
 }
 if(results.initial.state!=='needs-download') {
   results.blocked='Fresh profile does not currently offer a download. No model flags or availability mocks were used.';
 } else {
   results.checks.push('Fresh profile shows needs-download without implicitly creating a session');
   await evaluate("(async()=>{window.firstAttempt=downloadProvider.startDownload().then(()=>({ok:true}),e=>({ok:false,error:e.message}));return true})()");
   await pause(10000);
   results.beforeCancel=await evaluate("downloadProvider.status.getSnapshot()");
   await evaluate("downloadProvider.cancel()");
   results.cancelled=await evaluate("await firstAttempt");
   assert.equal(results.cancelled.ok,false);
   assert.equal(await evaluate("downloadProvider.isReady()"),false);
   results.checks.push('Real pending model preparation can be cancelled');
   await evaluate("(async()=>{window.retryAttempt=downloadProvider.retry().then(()=>({ok:true}),e=>({ok:false,error:e.message}));return true})()");
   for(let i=0;i<60;i++){
     await pause(10000);
     const status=await evaluate("downloadProvider.status.getSnapshot()");
     console.log('Retry progress:',status.state,status.progress);
     results.states=await evaluate('downloadStates');
     if(['ready','error','stalled'].includes(status.state))break;
   }
   results.afterRetry=await evaluate("downloadProvider.status.getSnapshot()");
   if(results.afterRetry.state==='ready') results.checks.push('Retry reaches ready on real model');
   else results.remaining='Retry did not reach ready within the observation window; this is not a successful download result.';
   await evaluate("downloadProvider.cancel()");
   results.retryOutcome=await evaluate("await retryAttempt");
 }
 results.states=await evaluate("downloadStates");
} catch(error){results.error=error.message;process.exitCode=1}
finally{
 await evaluate("await window.downloadProvider?.cleanup()").catch(()=>{});
 results.states=await evaluate('downloadStates').catch(()=>results.states);
 results.observedStateEvents=results.states.length;
 let lastStateKey;
 results.states=results.states.filter(state=>{const key=JSON.stringify([state.state,Math.floor(state.progress*100),state.reason]);if(key===lastStateKey)return false;lastStateKey=key;return true;});
 results.stateRecording='State transitions and integer-percent progress changes retained; repetitive sub-percent events omitted.';
 writeFileSync('docs/validation/private-ai-download-2026-11-19.json',JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({...results,states:results.states.length},null,2));
 await send('Page.close');ws.close();
}
