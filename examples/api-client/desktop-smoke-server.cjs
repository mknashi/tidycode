// Local-only synthetic fixture. Does not log request/response contents or enable CORS.
const http=require('node:http');
http.createServer((req,res)=>{
  if(req.url==='/slow'){const timer=setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end('{"ok":true}');},10000);res.on('close',()=>clearTimeout(timer));return;}
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/ok'});res.end();return;}
  if(req.url==='/binary'){res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(Buffer.from([0,255,1,128,10]));return;}
  res.setHeader('Content-Type','application/json');
  if(req.url==='/error'){res.writeHead(400);res.end(JSON.stringify({error:'synthetic_error',error_description:'This error body has no CORS header.'}));return;}
  res.setHeader('Set-Cookie','synthetic=fixture; HttpOnly');res.end(JSON.stringify({ok:true,method:req.method,cookieReceived:Boolean(req.headers.cookie),originReceived:Boolean(req.headers.origin)}));
}).listen(8766,'127.0.0.1',()=>console.log('Desktop API fixture listening on http://127.0.0.1:8766 (Ctrl+C to stop)'));
