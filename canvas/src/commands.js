import { convertToExcalidrawElements, newElementWith, CaptureUpdateAction } from '@excalidraw/excalidraw';
import { createElement } from 'react';
import { flushSync } from 'react-dom';

export function connectCommands(api, host) {
  const doc=host.ownerDocument;
  let pointerDown=false;
  const down=()=>{pointerDown=true;};
  const up=()=>{pointerDown=false;queueMicrotask(()=>observe(api.getSceneElements()));};
  host.addEventListener('pointerdown',down,true);
  doc.addEventListener('pointerup',up);
  doc.addEventListener('pointercancel',up);
  let past = [], future = [], last = JSON.stringify(api.getSceneElements()), restoring = false;
  const observe = elements => {
    const next = JSON.stringify(elements.filter(e=>!e.isDeleted));
    if (next === last) return;
    if (!restoring) { past.push(last); if(past.length>100) past.shift(); future=[]; }
    last=next;
  };
  const syncConnections = elements => elements.filter(e=>!e.customData?.connection || e.customData.connection.every(id=>elements.some(n=>n.id===id&&!n.isDeleted))).map(e=>{
    if(!e.customData?.connection) return e;
    const [a,b]=e.customData.connection.map(id=>elements.find(n=>n.id===id));
    const x=a.x+a.width/2, y=a.y+a.height/2, dx=b.x+b.width/2-x, dy=b.y+b.height/2-y;
    if(e.x===x&&e.y===y&&e.points[1][0]===dx&&e.points[1][1]===dy) return e;
    return newElementWith(e,{x,y,points:[[0,0],[dx,dy]],width:Math.abs(dx),height:Math.abs(dy)});
  });
  const apply = elements => {
    elements=syncConnections(elements);
    const selectedElementIds=Object.fromEntries(Object.entries(api.getAppState().selectedElementIds).filter(([id])=>elements.some(e=>e.id===id&&!e.isDeleted)));
    api.updateScene({elements, appState:{selectedElementIds}, captureUpdate:CaptureUpdateAction.IMMEDIATELY});
    observe(api.getSceneElements());
  };
  const state = () => ({ elements:api.getSceneElements().map(e=>({id:e.id,type:e.type,text:e.text,x:e.x,y:e.y,width:e.width,height:e.height,connection:e.customData?.connection})), selectedIds:Object.keys(api.getAppState().selectedElementIds), undoSteps:past.length, redoSteps:future.length });
  const execute = c => {
    if (!c || typeof c.op !== 'string') throw Error('op is required');
    const s=api.getAppState();
    if (pointerDown || s.editingTextElement || s.draggingElement || s.resizingElement) throw Error('Finish the active mouse/text edit first');
    observe(api.getSceneElements());
    let elements=[...api.getSceneElements()];
    const find = id => { const e=elements.find(e=>e.id===id); if(!e) throw Error(`Unknown element: ${id}`); return e; };
    const text = () => { if(typeof c.text!=='string'||!c.text.trim()||c.text.length>10000) throw Error('text must contain 1–10000 characters'); return c.text; };
    const coordinate = (v, fallback) => { if(v===undefined && fallback!==undefined) return fallback; if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e7) throw Error('Finite x/y coordinates required'); return v; };
    if (c.op==='list'||c.op==='state') return state();
    if(c.op==='undo'||c.op==='redo') {
      const from=c.op==='undo'?past:future, to=c.op==='undo'?future:past;
      if(!from.length) throw Error(`Nothing to ${c.op}`);
      const target=from.pop(); to.push(last); restoring=true;
      try { apply(JSON.parse(target)); last=target; } finally { restoring=false; }
      return state();
    }
    if(c.op==='add') {
      const created=convertToExcalidrawElements([{type:'text',text:text(),x:coordinate(c.x,100),y:coordinate(c.y,100+elements.length*50),fontSize:24}]);
      apply([...elements,...created]); return {createdIds:created.map(e=>e.id),...state()};
    }
    const target=find(c.id);
    if(c.op==='select') { api.updateScene({appState:{selectedElementIds:{[target.id]:true}}}); return state(); }
    if(c.op==='rename') {
      if(target.type!=='text'||target.containerId) throw Error('rename currently supports standalone text elements');
      const [measured]=convertToExcalidrawElements([{...target,text:text(),originalText:c.text,autoResize:true}]);
      elements=elements.map(e=>e.id===target.id?newElementWith(e,{text:c.text,originalText:c.text,width:measured.width,height:measured.height}):e);
    } else if(c.op==='move') {
      elements=elements.map(e=>e.id===target.id?newElementWith(e,{x:coordinate(c.x),y:coordinate(c.y)}):e);
    } else if(c.op==='delete') {
      elements=elements.filter(e=>e.id!==target.id&&!e.customData?.connection?.includes(target.id));
    } else if(c.op==='connect') {
      const end=find(c.to); if(end.id===target.id) throw Error('Cannot connect an element to itself');
      const x=target.x+target.width/2,y=target.y+target.height/2;
      elements.push(...convertToExcalidrawElements([{type:'arrow',x,y,points:[[0,0],[end.x+end.width/2-x,end.y+end.height/2-y]],customData:{connection:[target.id,end.id]}}]));
    } else throw Error(`Unknown operation: ${c.op}`);
    apply(elements); return state();
  };
  let socket, stopped=false, reconnect;
  const start = () => {
    socket=new WebSocket(`ws://${location.host}/canvas-ws`);
    socket.onmessage = event => {
      const {id,command}=JSON.parse(event.data);
      try {
        let result;
        flushSync(()=>{result=execute(command);});
        socket.send(JSON.stringify({id,result:{...result,...state()}}));
      }
      catch(error) { socket.send(JSON.stringify({id,error:error.message})); }
    };
    // A previous tab/HMR connection may still be closing. A temporary slot
    // conflict must not permanently disable this page's command connection.
    socket.onclose = event => { if(!stopped) reconnect=setTimeout(start,event.code===1008?3000:1000); };
  };
  start();
  const unsubscribe=api.onChange((elements, appState)=>{
    if(pointerDown||appState.draggingElement||appState.editingTextElement||appState.resizingElement) return;
    const synced=syncConnections(elements);
    if(synced.length!==elements.length||synced.some((e,i)=>e!==elements[i])) { apply(synced); return; }
    observe(elements);
  });
  for(const op of ['undo','redo']) api.registerAction({
    name:op,label:op==='undo'?'撤销':'重做',trackEvent:false,
    keyTest:event=>(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&!!event.shiftKey===(op==='redo'),
    perform:()=>{try{execute({op});}catch(error){api.setToast({message:error.message});}return false;},
    PanelComponent:({updateData})=>createElement('button',{type:'button','aria-label':op==='undo'?'撤销':'重做',onClick:()=>updateData(null)},op==='undo'?'↶':'↷'),
  });
  return () => { stopped=true; clearTimeout(reconnect); socket.close(); unsubscribe(); host.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',up); };
}
