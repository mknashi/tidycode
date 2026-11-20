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
const results = {browser: await send('Browser.getVersion'), checks:[]};
try {
 await evaluate("window.validationProvider = new (await import('/src/services/ai/providers/ChromeBuiltInProvider.js')).ChromeBuiltInProvider({downloadTimeoutMs:45000,timeoutMs:45000})");
 const availability = await evaluate("typeof LanguageModel === 'undefined' ? 'absent' : await LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]})");
 results.availability=availability;
 if(availability !== 'available') throw new Error('Model not installed; this validation does not initiate a download.');
 console.log('Initializing installed model');
 await evaluate("await validationProvider.initialize()");
 assert.equal(await evaluate("validationProvider.isReady()"),true);
 results.checks.push('Real installed model initialization: ready');
 await send('Network.enable');
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 const offline = await evaluate("await validationProvider.chat([{role:'user',content:'Correct the grammar and return only the corrected sentence: She go to school every day.'}])");
 assert.match(offline.text,/She goes to school every day/i);
 results.checks.push({check:'Real model inference with page network offline',answer:offline.text});
 const cancelled=await evaluate("(async()=>{const controller=new AbortController();const request=validationProvider.chat([{role:'user',content:'Write a long story about a garden.'}],{signal:controller.signal});controller.abort();try{await request;return false}catch{return !validationProvider.task && validationProvider.isReady()}})()");
 assert.equal(cancelled,true);results.checks.push('Immediate inference cancellation frees task and preserves ready state');
 await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await evaluate("(async()=>{validationProvider.session.destroy();validationProvider.session=null;validationProvider.status.set('error');await validationProvider.refreshAvailability()})()");
 assert.equal(await evaluate("validationProvider.isReady()"),true);
 results.checks.push('Destroyed real session recovers through availability refresh');
 await evaluate("await validationProvider.cleanup()");
 assert.equal(await evaluate("validationProvider.isReady()"),false);
 await evaluate("await validationProvider.initialize()");
 assert.equal(await evaluate("validationProvider.isReady()"),true);
 results.checks.push('Cleanup and reinitialization with installed model');
 assert.equal(errors.length,0);
} catch(error) {results.error=error.message;process.exitCode=1}
finally {
 await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
 await evaluate("await window.validationProvider?.cleanup()").catch(()=>{});
 writeFileSync(evidencePath,JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results,null,2));
 await send('Page.close');
 ws.close();
}
