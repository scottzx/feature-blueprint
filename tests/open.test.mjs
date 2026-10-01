import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startBlueprintServer } from '../cli/open.mjs';

async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'blueprint-open-'));
    const file = join(dir, 'product.blueprint.json');
    const document = { format: '1agents.feature-blueprint', version: 1, metadata: { owner: 'custom' }, nodes: [
        { id: 'root', kind: 'module', title: 'Root', notes: 'Original notes', position: 0, createdAt: '2026-10-01T00:00:00.000Z', custom: 42 },
    ] };
    await writeFile(file, JSON.stringify(document));
    t.after(() => rm(dir, { recursive: true, force: true }));
    return { file, document };
}
async function start(t, file) {
    const opened = await startBlueprintServer(file);
    t.after(() => new Promise(resolve => { opened.server.close(resolve); opened.server.closeAllConnections(); }));
    return opened;
}
function post(url, input, headers = {}) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin, ...headers }, body: JSON.stringify(input) });
}

test('opens real file assets, saves notes atomically and follows external file changes', async t => {
    const { file } = await fixture(t);
    const { url } = await start(t, file);
    const page = await fetch(url);
    assert.equal(page.status, 200); assert.match(await page.text(), /editor.js/);
    for (const asset of ['editor.js', 'style.css']) assert.equal((await fetch(url + asset)).status, 200);
    const api = url + 'api/document';
    const initial = await (await fetch(api)).json();
    const nodes = initial.document.nodes.map(node => ({ ...node, notes: 'First line\n  Second line' }));
    const saved = await post(api, { revision: initial.revision, nodes });
    assert.equal(saved.status, 200);
    const next = await saved.json();
    assert.equal(next.document.nodes[0].notes, nodes[0].notes);
    assert.equal(next.document.nodes[0].custom, 42);
    assert.deepEqual(next.document.metadata, { owner: 'custom' });
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), next.document);
    assert.notEqual(next.revision, initial.revision);
    assert.equal((await post(api, { revision: initial.revision, nodes })).status, 409);
    next.document.nodes[0].title = 'External title';
    await writeFile(file, JSON.stringify(next.document));
    assert.equal((await (await fetch(api)).json()).document.nodes[0].title, 'External title');
});

test('refuses cross-origin writes, arbitrary paths, invalid nodes and unversioned writes', async t => {
    const { file } = await fixture(t);
    const { url } = await start(t, file);
    const api = url + 'api/document';
    const initial = await (await fetch(api)).json();
    const input = { revision: initial.revision, nodes: initial.document.nodes };
    const before = await readFile(file, 'utf8');
    assert.equal((await post(api, input, { Origin: 'https://example.com' })).status, 403);
    const invalidHostStatus = await new Promise((resolve, reject) => {
        const request = httpRequest(api, { headers: { Host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode); });
        request.on('error', reject); request.end();
    });
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(new URL('/api/document', url))).status, 404);
    assert.equal((await fetch(url + '../package.json')).status, 404);
    assert.equal((await post(api, { nodes: input.nodes })).status, 400);
    assert.equal((await post(api, { ...input, nodes: [{ ...input.nodes[0], notes: {} }] })).status, 400);
    assert.equal(await readFile(file, 'utf8'), before);
});

test('the CLI prints the URL, runs without a desktop and stops on SIGTERM', async t => {
    const { file } = await fixture(t);
    const child = spawn(process.execPath, [fileURLToPath(new URL('../cli/blueprint.mjs', import.meta.url)), 'open', file, '--no-browser'], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    const output = await new Promise((resolve, reject) => {
        let text = '';
        const timer = setTimeout(() => reject(new Error('CLI open timed out')), 10000);
        child.stdout.on('data', chunk => {
            text += chunk;
            if (text.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(text.split('\n')[0])); }
        });
        child.on('exit', code => { clearTimeout(timer); reject(new Error(`CLI exited ${code}`)); });
    });
    assert.equal(output.ok, true);
    assert.equal((await fetch(output.url)).status, 200);
    const stopped = once(child, 'exit'); child.kill('SIGTERM');
    assert.equal((await stopped)[0], 0);
});

test('persists web, node and note references, rejecting unsafe links without altering the file', async t => {
    const { file } = await fixture(t);
    const { url } = await start(t, file);
    const api = url + 'api/document';
    const initial = await (await fetch(api)).json();
    const links = [{ kind: 'web', url: 'https://example.com', title: '资料' }, { kind: 'node', nodeId: 'deleted' },
        { kind: 'note', noteId: 'note-1', title: '笔记', content: '正文快照' }];
    const saved = await post(api, { revision: initial.revision, nodes: initial.document.nodes.map(node => ({ ...node, links })) });
    assert.equal(saved.status, 200);
    const next = await saved.json();
    assert.deepEqual(next.document.nodes[0].links, links);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).nodes[0].links, links);
    const before = await readFile(file, 'utf8');
    const invalid = await post(api, { revision: next.revision, nodes: next.document.nodes.map(node => ({ ...node, links: [{ kind: 'web', url: 'javascript:alert(1)' }] })) });
    assert.equal(invalid.status, 400);
    assert.equal(await readFile(file, 'utf8'), before);
});
