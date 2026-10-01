/** Loopback editor for one explicit file; writes use the same CLI lock and revisions. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readBlueprintNodes } from '../dist/document.js';
import { readDocument, updateDocument } from './file.mjs';

const assets = {
    '': ['index.html', 'text/html; charset=utf-8'],
    'editor.js': ['editor.js', 'text/javascript; charset=utf-8'],
    'style.css': ['style.css', 'text/css; charset=utf-8'],
};
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Start a file editor on 127.0.0.1, with a random per-process URL capability. */
export async function startBlueprintServer(file, { port = 0 } = {}) {
    const initial = await readDocument(file);
    const loaded = new Map(await Promise.all(Object.entries(assets).map(async ([route, [name, type]]) =>
        [route, { type, body: await readFile(new URL(`../web-dist/${name}`, import.meta.url)) }])));
    const prefix = `/${randomUUID()}/`;
    let origin;
    const server = createServer(async (request, response) => {
        const send = (status, body, type = 'application/json; charset=utf-8') => {
            response.writeHead(status, {
                'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
                'Referrer-Policy': 'no-referrer',
            });
            response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
        };
        try {
            if (request.headers.host !== new URL(origin).host) return send(403, { error: 'Invalid Host' });
            const pathname = new URL(request.url, origin).pathname;
            if (!pathname.startsWith(prefix)) return send(404, { error: 'Not found' });
            const route = pathname.slice(prefix.length);
            if (route === 'api/document') {
                if (request.method === 'GET') {
                    const value = await readDocument(initial.path);
                    return send(200, { path: value.path, revision: value.revision, document: value.document });
                }
                if (request.method !== 'POST') return send(405, { error: 'Method not allowed' });
                if (request.headers.origin !== origin) return send(403, { error: 'Invalid Origin' });
                if (request.headers['content-type']?.split(';')[0] !== 'application/json') return send(415, { error: 'Expected JSON' });
                const chunks = [];
                let size = 0;
                for await (const chunk of request) {
                    size += chunk.length;
                    if (size > MAX_BODY_BYTES) return send(413, { error: 'Document exceeds 10 MiB' });
                    chunks.push(chunk);
                }
                const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!input || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) {
                    return send(400, { error: 'A current document revision is required' });
                }
                const nodes = readBlueprintNodes(input.nodes);
                const result = await updateDocument(initial.path, { expectedRevision: input.revision }, document => {
                    document.nodes = nodes;
                    return { document };
                });
                return send(200, result);
            }
            if (request.method !== 'GET') return send(405, { error: 'Method not allowed' });
            const asset = loaded.get(route);
            if (!asset) return send(404, { error: 'Not found' });
            send(200, asset.body, asset.type);
        } catch (error) {
            send(['REVISION_CONFLICT', 'EEXIST'].includes(error.code) ? 409 : 400,
                { error: error.message, code: error.code ?? 'INVALID_BLUEPRINT' });
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
    return { server, path: initial.path, url: origin + prefix };
}

/** Launch the OS default browser; missing desktop launchers leave the printed URL usable. */
export async function launchBrowser(url) {
    const [command, args] = process.platform === 'darwin' ? ['open', [url]]
        : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'ignore' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Browser launcher exited ${code}`)));
    });
}
