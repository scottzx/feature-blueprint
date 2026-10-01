import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { apply } from '../packages/dsh-plugin/dist/host.js';

const bundle = await build({ entryPoints: ['packages/dsh-plugin/src/file-editor.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { FileEditor } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const rpcBundle = await build({ entryPoints: ['packages/dsh-plugin/src/file-rpc.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { fileContribution, sessionFileOf } = await import(`data:text/javascript;base64,${Buffer.from(rpcBundle.outputFiles[0].text).toString('base64')}`);
const nodes = [
    { id: 'a', kind: 'module', title: 'A', position: 0, createdAt: '2026-10-01T00:00:00.000Z', custom: { retained: true } },
    { id: 'b', kind: 'module', title: 'B', position: 1, createdAt: '2026-10-01T00:00:00.000Z' },
];
const document = { format: '1agents.feature-blueprint', version: 1, nodes, metadata: { retained: true } };
const text = JSON.stringify(document);
const address = 'dsh-resource://file/session/test/product.blueprint.json';
const renamed = nodes.map(n => n.id === 'a' ? { ...n, title: 'Renamed' } : n);

function hostFixture({ mode = 'workspace-write', outside = false, versionChanged = false, live = true, invalidText } = {}) {
    let stored = invalidText ?? text;
    const writes = [], registrations = [], disposers = [];
    const root = { targetKey: 'root' }, target = { targetKey: 'file' };
    let closed = false;
    let registered;
    const ctx = {
        effect(fn) { disposers.push(fn()); },
        reflect: { provide(key, value) { registered = value; return () => { registered = undefined; }; } },
        typert: { register(value) { registrations.push(value); return () => registrations.pop(); } },
        sessions: { get(id) { assert.equal(id, 'test'); return live ? { header: { cwd: '/work' } } : undefined; } },
        sessionPersistence: { async open(id, access) {
            assert.equal(id, 'test'); assert.equal(access, 'read');
            return { header: { cwd: '/work' }, async read() { return { events: [{ type: 'sandbox/mode', data: { mode } }] }; }, async close() { closed = true; } };
        } },
        sandboxPolicy: { workspaceRoot: '/fallback', resolve(request) { return { mode: request?.mode ?? mode, workspaceRoot: request?.session?.header.cwd ?? '/fallback' }; } },
        fs: {
            async resolve(path, options) { if (path === '/work') return root; assert.equal(options.cwd, '/work'); assert.equal(path, 'product.blueprint.json'); return target; },
            contains(parent, child) { assert.equal(parent, root); assert.equal(child, target); return !outside; },
            async stat() { return { type: 'file', version: 'v1' }; },
            async readBytes(_target, signal, limit) { assert.ok(limit > 0); signal.throwIfAborted(); return new TextEncoder().encode(stored); },
            async writeText(file, next, guard, signal, policy) {
                assert.equal(file, target); assert.deepEqual(guard, { kind: 'replaceIfVersion', version: 'v1' });
                assert.equal(policy.workspaceRoot, '/work'); assert.equal(policy.sessionId, 'test');
                signal.throwIfAborted();
                if (versionChanged) throw Object.assign(new Error('changed during read'), { code: 'FS_STALE_VERSION' });
                writes.push(next); stored = next;
            },
        },
    };
    apply(ctx);
    return { service: registered, writes, registrations, get text() { return stored; }, get closed() { return closed; },
        dispose() { for (const fn of disposers.reverse()) fn(); }, get released() { return registered === undefined && registrations.length === 0; } };
}
const signal = () => new AbortController().signal;

test('Host saves renamed/reordered nodes with document and node extension fields intact, then releases registrations', async () => {
    const host = hostFixture();
    assert.equal(host.service.typertRemote.service, host.service);
    const nextNodes = renamed.map((node, index) => ({ ...node, position: 1 - index }));
    const result = await host.service.save(address, text, nextNodes, signal());
    assert.equal(result.ok, true);
    assert.equal(result.text, host.text);
    assert.deepEqual(JSON.parse(host.text), { ...document, nodes: nextNodes });
    assert.equal(host.writes.length, 1);
    host.dispose(); assert.equal(host.released, true);
});

test('Host refuses stale file bytes and a file changed between reading and atomic publication', async () => {
    for (const [options, expected] of [[{}, text + '\n'], [{ versionChanged: true }, text]]) {
        const host = hostFixture(options);
        const result = await host.service.save(address, expected, renamed, signal());
        assert.equal(result.error.code, 'REVISION_CONFLICT');
        assert.equal(host.writes.length, 0); assert.equal(host.text, text);
    }
});

test('Host enforces read-only, canonical workspace containment and validation before writing', async () => {
    for (const [options, next, expectedCode] of [
        [{ mode: 'read-only' }, renamed, 'READ_ONLY'],
        [{ mode: 'danger-full-access', outside: true }, renamed, 'OUTSIDE_WORKSPACE'],
        [{}, [{ ...nodes[0], parentId: 'a' }], 'SAVE_FAILED'],
        [{ invalidText: '{' }, renamed, 'SAVE_FAILED'],
    ]) {
        const host = hostFixture(options);
        const result = await host.service.save(address, options.invalidText ?? text, next, signal());
        assert.equal(result.ok, false); assert.equal(result.error.code, expectedCode); assert.equal(host.writes.length, 0);
    }
});

test('Host reads historical session policy without activating an Agent and closes the read handle', async () => {
    for (const mode of ['read-only', 'workspace-write']) {
        const host = hostFixture({ live: false, mode });
        const result = await host.service.save(address, text, renamed, signal());
        assert.equal(result.ok, mode === 'workspace-write'); assert.equal(host.closed, true);
    }
});

test('wire contract rejects malformed file addresses and invalid nodes', () => {
    assert.deepEqual(sessionFileOf('dsh-resource://file/session/test/%E6%96%87%E4%BB%B6.blueprint.json'), { sessionId: 'test', path: '文件.blueprint.json' });
    for (const invalid of ['file:///work/product.blueprint.json', 'dsh-resource://file/absolute/work/product.blueprint.json', 'dsh-resource://file/session//a.blueprint.json', 'dsh-resource://file/session/test/a.json', 'dsh-resource://file/session/test/%FF.blueprint.json']) assert.throws(() => sessionFileOf(invalid));
    const parseNodes = fileContribution.descriptors[0].parameters[2].codec.create().parse;
    assert.throws(() => parseNodes([{ ...nodes[0], title: '' }]));
});

test('editor serializes saves, adopts saved bytes and ignores a preview refresh carrying the old content', async () => {
    let finish;
    const writes = [];
    const editor = new FileEditor(text, address, async (...args) => { writes.push(args); return await new Promise(resolve => { finish = resolve; }); }, () => {});
    const saving = editor.save(renamed);
    await editor.save(nodes);
    assert.equal(editor.state.saving, true); assert.equal(writes.length, 1);
    editor.receive(text);
    const savedText = JSON.stringify({ ...document, nodes: renamed });
    finish({ ok: true, text: savedText }); await saving;
    editor.receive(text);
    assert.equal(editor.state.text, savedText);
    assert.equal(editor.state.document.nodes[0].title, 'Renamed');

});

test('editor keeps a downloadable draft on failure and displays concurrent external changes', async () => {
    let finish;
    const editor = new FileEditor(text, address, async () => await new Promise(resolve => { finish = resolve; }), () => {});
    const saving = editor.save(renamed);
    const external = JSON.stringify({ ...document, metadata: { owner: 'external' } });
    editor.receive(external);
    finish({ ok: false, error: { code: 'REVISION_CONFLICT', message: 'changed' } }); await saving;
    assert.equal(editor.state.saving, false); assert.equal(editor.state.text, external);
    assert.equal(editor.state.error.code, 'REVISION_CONFLICT');
    assert.deepEqual(JSON.parse(editor.state.draft), { ...document, nodes: renamed });
});

test('disposing the file editor cancels outstanding work and prevents updates to the next file', async () => {
    let finish, count = 0, receivedSignal;
    const editor = new FileEditor(text, address, async (_address, _text, _nodes, signal) => { receivedSignal = signal; return await new Promise(resolve => { finish = resolve; }); }, () => count++);
    const saving = editor.save(renamed); editor.dispose();
    assert.equal(receivedSignal.aborted, true);
    finish({ ok: true, text: JSON.stringify({ ...document, nodes: renamed }) }); await saving;
    assert.equal(count, 1);
    editor.receive(text + '\n'); assert.equal(count, 1);
});
