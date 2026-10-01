import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

export function installCanvasBridge(server) {
  const wss = new WebSocketServer({ noServer: true });
  let client;
  const pending = new Map();
  server.httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/canvas-ws') return;
    if (req.headers.origin !== `http://${req.headers.host}` || !/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      if (client?.readyState === 1) { ws.close(1008, 'Only one active canvas is supported'); return; }
      client = ws;
      ws.on('message', raw => {
        try { const msg = JSON.parse(raw); pending.get(msg.id)?.(msg); } catch {}
      });
      ws.on('close', () => { if (client === ws) { client = null; for (const done of [...pending.values()]) done({error:'Canvas disconnected'}); } });
    });
  });
  server.middlewares.use('/api/canvas', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '') || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) return send(403, {error:'Local CLI or same-origin requests only'});
    if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return send(405, {error:'POST application/json required'});
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      let command; try { command = JSON.parse(body); } catch { return send(400,{error:'Invalid JSON'}); }
      if (client?.readyState !== 1) return send(503,{error:'Open http://127.0.0.1:5178/ in a browser first'});
      const id = randomUUID();
      const timer = setTimeout(() => { pending.delete(id); send(504,{error:'Canvas did not acknowledge; inspect state before retrying'}); }, 10000);
      pending.set(id, msg => { clearTimeout(timer); pending.delete(id); send(msg.error ? 400 : 200, msg); });
      client.send(JSON.stringify({ id, command }));
    });
  });
}

export function canvasBridge() { return { name: 'canvas-command-bridge', configureServer: installCanvasBridge }; }
