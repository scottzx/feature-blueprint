import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {installCanvasBridge} from './canvas-bridge.js';

export async function serve(port=5178){
  const root=fileURLToPath(new URL('../../dist/',import.meta.url));
  await readFile(resolve(root,'index.html')); // Fail early if the package lacks its build.
  let canvasHandler;
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png'};
  const server=createServer(async(req,res)=>{
    if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403);res.end('Local requests only');return;}
    if(req.url==='/api/canvas'){canvasHandler(req,res);return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    try{
      const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=resolve(root,'.'+(path==='/'?'/index.html':path));
      if(!file.startsWith(resolve(root)+sep)){res.writeHead(403);res.end();return;}
      const data=await readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  installCanvasBridge({httpServer:server,middlewares:{use(path,handler){canvasHandler=handler;}}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
