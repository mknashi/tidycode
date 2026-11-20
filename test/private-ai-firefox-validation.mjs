// Requires Vite :5187 and an isolated headless Firefox profile with WebDriver BiDi :9338. Uses synthetic tab data only.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const ws=new WebSocket('ws://127.0.0.1:9338/session');
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;pending.set(seq,m=>m.type==='error'?reject(new Error(JSON.stringify(m))):resolve(m.result));ws.send(JSON.stringify({id:seq,method,params}))});
const session=await send('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:false}}});
const {context}=await send('browsingContext.create',{type:'tab'});
const evaluate=async expression=>{
 const r=await send('script.evaluate',{expression,target:{context},awaitPromise:true,resultOwnership:'none'});
 if(r.type==='exception')throw new Error(JSON.stringify(r));
 return r.result.value;
};
const results={browser:session.capabilities.browserName,version:session.capabilities.browserVersion};
try{
 await send('browsingContext.navigate',{context,url:'http://127.0.0.1:5187/',wait:'complete'});
 await new Promise(r=>setTimeout(r,2500));
 await evaluate("localStorage.setItem('privacy-banner-dismissed','true');localStorage.setItem('tidycode-analytics-consent','denied');localStorage.setItem('notepad-tabs',JSON.stringify([{id:1,title:'Welcome',content:'',isModified:false}]));localStorage.setItem('notepad-active-tab','1')");
 await send('browsingContext.reload',{context,wait:'complete'});await new Promise(r=>setTimeout(r,2000));
 await evaluate('document.querySelector(\'section[aria-label="New in Tidy Code"] button\').click()');
 await new Promise(r=>setTimeout(r,500));
 results.ui=JSON.parse(await evaluate('JSON.stringify((()=>{const radio=document.querySelector(\'input[name=provider][value="chrome-nano"]\');return {api:typeof LanguageModel,disabled:radio.disabled,gray:getComputedStyle(radio.closest("[aria-disabled]")).filter,reason:document.querySelector("#private-ai-availability").textContent}})())'));
 assert.equal(results.ui.disabled,true);assert.equal(results.ui.gray,'grayscale(1)');
 results.status='passed';
}catch(e){results.error=e.message;process.exitCode=1}
finally{
 writeFileSync('docs/validation/private-ai-firefox-2026-11-19.json',JSON.stringify(results,null,2)+'\n');
 console.log(results);
 await send('session.end');ws.close();
}
