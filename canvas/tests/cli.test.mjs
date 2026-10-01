import assert from 'node:assert/strict';
async function call(command, fail=false) {
 const r=await fetch('http://127.0.0.1:5178/api/canvas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});
 const data=await r.json();
 if(fail){assert.ok(!r.ok);return data;}
 assert.ok(r.ok,JSON.stringify(data));return data.result;
}
const baseline=await call({op:'state'});
const created=[];
try {
 const a=await call({op:'add',text:'CLI test A',x:100,y:100}); const id=a.createdIds[0];created.push(id);
 const b=await call({op:'add',text:'CLI test B',x:500,y:200}); const to=b.createdIds[0];created.push(to);
 let r=await call({op:'rename',id,text:'中文改名测试'});assert.equal(r.elements.find(e=>e.id===id).text,'中文改名测试');
 r=await call({op:'connect',id,to});assert.ok(r.elements.some(e=>e.connection?.[0]===id));
 r=await call({op:'move',id,x:220,y:160});assert.equal(r.elements.find(e=>e.id===id).x,220);
 r=await call({op:'undo'});assert.equal(r.elements.find(e=>e.id===id).x,100);
 r=await call({op:'redo'});assert.equal(r.elements.find(e=>e.id===id).x,220);
 r=await call({op:'select',id});assert.deepEqual(r.selectedIds,[id]);
 await call({op:'move',id,x:'invalid',y:2},true);
 await call({op:'delete',id:'does-not-exist'},true);
 await call({op:'nonsense'},true);
 r=await call({op:'delete',id});assert.ok(!r.elements.some(e=>e.id===id||e.connection?.includes(id)));
 r=await call({op:'undo'});assert.ok(r.elements.some(e=>e.id===id));
 console.log('PASS: add, rename, connect, move, undo, redo, select, delete, invalid input');
} finally {
 for(const id of created){const s=await call({op:'state'});if(s.elements.some(e=>e.id===id))await call({op:'delete',id});}
 const final=await call({op:'state'});assert.deepEqual(final.elements,baseline.elements);
 console.log('PASS: original canvas elements preserved');
}
