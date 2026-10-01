#!/usr/bin/env node
const [op, ...args] = process.argv.slice(2);
if(op==='serve'){
  try{if(args.length)throw Error('serve takes no arguments; uses 127.0.0.1:5178');const {serve}=await import('../server/serve.js');await serve();console.log('Canvas ready: http://127.0.0.1:5178/ (Ctrl+C to stop)');}
  catch(error){console.error(error.code==='EADDRINUSE'?'Port 5178 is in use. Stop the existing server first.':error.message);process.exitCode=1;}
} else {
if (!op || op === '--help' || op === 'help') {
  console.log(`voice-canvas serve    Start the local canvas server
voice-canvas list | state
voice-canvas add "文字" [--x 100 --y 100]
voice-canvas rename ID "新文字"
voice-canvas move ID --x 400 --y 200
voice-canvas connect FROM_ID TO_ID
voice-canvas select ID
voice-canvas delete ID
voice-canvas undo | redo
voice-canvas json '{"op":"add","text":"内容"}'
Use node canvas/src/cli/canvas.mjs, or blueprint canvas. All command responses are JSON.
Requires one open canvas at http://127.0.0.1:5178/.`);
  process.exit(0);
}
try {
  let command = { op };
  const positional = [];
  for (let i=0;i<args.length;i++) {
    if (args[i].startsWith('--')) {
      const name = args[i].slice(2);
      if (!['x','y'].includes(name) || args[i+1] === undefined || !Number.isFinite(Number(args[i+1]))) throw Error('Expected --x NUMBER or --y NUMBER');
      command[name] = Number(args[++i]);
    } else positional.push(args[i]);
  }
  if (op === 'json') command = JSON.parse(positional[0]);
  else if (op === 'add') command.text = positional.join(' ');
  else { command.id = positional[0]; if (op === 'rename') command.text = positional.slice(1).join(' '); if (op === 'connect') command.to = positional[1]; }
  const response = await fetch('http://127.0.0.1:5178/api/canvas', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(command), signal:AbortSignal.timeout(12000) });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (error) { console.error(JSON.stringify({error:error.message})); process.exitCode=1; }
}
