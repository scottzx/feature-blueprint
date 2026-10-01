import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../src/server/serve.js';
import WebSocket from 'ws';
test('packaged server serves assets, validates requests and relays commands',async()=>{
  const server=await serve(0),base=`http://127.0.0.1:${server.address().port}`;
  let ws;
  try{
    const page=await fetch(base);assert.equal(page.status,200);const html=await page.text();const asset=html.match(/src="([^"]+\.js)"/)[1];assert.equal((await fetch(base+asset)).status,200);
    const call=(headers={})=>fetch(base+'/api/canvas',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({op:'state'})});
    assert.equal((await call()).status,503);assert.equal((await call({Origin:'https://example.com'})).status,403);
    ws=new WebSocket(base.replace('http:','ws:')+'/canvas-ws',{origin:base});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
    ws.on('message',raw=>{const {id,command}=JSON.parse(raw);ws.send(JSON.stringify({id,result:{op:command.op}}));});
    const res=await call();assert.equal(res.status,200);assert.equal((await res.json()).result.op,'state');
  }finally{if(ws){ws.terminate();await new Promise(r=>ws.once('close',r));}await new Promise(r=>server.close(r));}
});
