import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readlink, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../cli/blueprint.mjs', import.meta.url));
async function run(...args) {
    try { const { stdout, stderr } = await exec(process.execPath, [cli, ...args]); assert.equal(stderr, ''); return JSON.parse(stdout); }
    catch (error) {
        if (!error.stderr) throw error;
        assert.equal(error.code, 1); assert.equal(error.stdout, ''); return JSON.parse(error.stderr);
    }
}
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'blueprint-cli-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = join(dir, 'sample.blueprint.json');
    assert.equal((await run('init', file)).ok, true);
    return { dir, file };
}
async function add(file, id, kind = 'module', parent) {
    const result = await run('add', file, '--id', id, '--kind', kind, '--title', id, ...(parent ? ['--parent', parent] : []));
    assert.equal(result.ok, true); return result;
}

test('creates, edits, reorders, reparents and reads a persisted tree with stable ids', async t => {
    const { file } = await fixture(t);
    await add(file, 'accounts'); await add(file, 'workspace');
    await add(file, 'login', 'feature', 'accounts'); await add(file, 'sms', 'feature', 'accounts');
    assert.equal((await run('rename', file, '--id', 'login', '--title', '密码登录')).node.id, 'login');
    assert.equal((await run('move', file, '--id', 'sms', '--before', 'login')).ok, true);
    assert.equal((await run('move', file, '--id', 'login', '--inside', 'workspace')).ok, true);
    const listed = await run('list', file);
    const expected = JSON.parse(await readFile(new URL('./expected/cli-tree.json', import.meta.url), 'utf8'));
    assert.deepEqual(listed.nodes, expected);
    assert.equal((await run('validate', file)).nodeCount, 4);
    assert.equal((await run('show', file)).revision, listed.revision);
    assert.equal((await run('remove', file, '--id', 'sms')).ok, true);
    assert.equal((await run('validate', file)).nodeCount, 3);
});

test('adds and edits multiline notes, preserving them through rename/move and allowing clearing', async t => {
    const { file } = await fixture(t);
    const notes = '第一行\n  第二行，保留空格';
    const added = await run('add', file, '--id', 'root', '--kind', 'module', '--title', 'Root', '--notes', notes);
    assert.equal(added.node.notes, notes);
    await add(file, 'other'); await add(file, 'leaf', 'feature', 'root');
    const before = await readFile(file, 'utf8');
    for (const options of [[], ['--text', 'x', '--expect-revision', added.revision]]) {
        assert.equal((await run('notes', file, '--id', 'leaf', ...options)).ok, false);
        assert.equal(await readFile(file, 'utf8'), before);
    }
    assert.equal((await run('notes', file, '--id', 'leaf', '--text', notes)).node.notes, notes);
    assert.equal((await run('rename', file, '--id', 'leaf', '--title', 'New title')).node.notes, notes);
    assert.equal((await run('move', file, '--id', 'leaf', '--inside', 'other')).node.notes, notes);
    assert.equal((await run('list', file)).nodes.find(node => node.id === 'leaf').notes, notes);
    assert.equal((await run('show', file)).document.nodes.find(node => node.id === 'root').notes, notes);
    assert.equal((await run('notes', file, '--id', 'leaf', '--text', '')).node.notes, '');
    assert.equal((await run('show', file)).document.nodes.find(node => node.id === 'leaf').notes, '');
});
test('rejects invalid mutations and arguments without changing bytes or leaving owned locks', async t => {
    const { dir, file } = await fixture(t);
    await add(file, 'root'); await add(file, 'leaf', 'feature', 'root');
    const before = await readFile(file, 'utf8');
    for (const args of [
        ['init'], ['add', '--kind', 'feature', '--title', 'orphan'], ['add', '--kind', 'module', '--title', 'child', '--parent', 'leaf'],
        ['add', '--id', 'root', '--kind', 'module', '--title', 'duplicate'], ['rename', '--id', 'missing', '--title', 'x'],
        ['rename', '--id', 'root', '--title', ' '], ['remove', '--id', 'root'], ['move', '--id', 'leaf', '--root'],
        ['move', '--id', 'root', '--inside', 'root'], ['move', '--id', 'leaf', '--root', '--inside', 'root'],
        ['rename', '--id', 'root', '--title', 'x', '--titel', 'typo'], ['rename', '--id', 'root', '--id', 'leaf', '--title', 'x'],
    ]) {
        const [command, ...options] = args;
        assert.equal((await run(command, file, ...options)).ok, false, JSON.stringify(args));
        assert.equal(await readFile(file, 'utf8'), before);
        assert.deepEqual(await readdir(dir), ['sample.blueprint.json']);
    }
});
test('requires subtree opt-in and retains other document/node fields on save', async t => {
    const { file } = await fixture(t);
    await add(file, 'root'); await add(file, 'child', 'module', 'root'); await add(file, 'leaf', 'feature', 'child');
    const value = JSON.parse(await readFile(file, 'utf8'));
    value.metadata = { label: 'custom' }; value.nodes[0].notes = 'keep';
    await writeFile(file, JSON.stringify(value));
    assert.equal((await run('rename', file, '--id', 'root', '--title', 'new')).ok, true);
    const saved = (await run('show', file)).document;
    assert.deepEqual(saved.metadata, value.metadata); assert.equal(saved.nodes[0].notes, 'keep');
    assert.deepEqual((await run('remove', file, '--id', 'child', '--subtree')).removedIds, ['child', 'leaf']);
    assert.equal((await run('validate', file)).nodeCount, 1);
});
test('rejects stale revisions and existing writer locks, preserving the other lock', async t => {
    const { file } = await fixture(t);
    const initial = (await run('show', file)).revision;
    await add(file, 'root');
    assert.equal((await run('rename', file, '--id', 'root', '--title', 'x', '--expect-revision', initial)).error.code, 'REVISION_CONFLICT');
    const before = await readFile(file, 'utf8');
    await writeFile(`${file}.lock`, 'other writer');
    assert.equal((await run('rename', file, '--id', 'root', '--title', 'x')).error.code, 'EEXIST');
    assert.equal(await readFile(`${file}.lock`, 'utf8'), 'other writer');
    assert.equal(await readFile(file, 'utf8'), before);
});
test('concurrent cooperating processes commit at most one mutation of a given revision', async t => {
    const { file } = await fixture(t); await add(file, 'root');
    const revision = (await run('show', file)).revision;
    const results = await Promise.all(['a', 'b'].map(title => run('rename', file, '--id', 'root', '--title', title, '--expect-revision', revision)));
    assert.equal(results.filter(value => value.ok).length, 1);
    assert.ok(['EEXIST', 'REVISION_CONFLICT'].includes(results.find(value => !value.ok).error.code));
    assert.equal((await run('validate', file)).nodeCount, 1);
});
test('edits a symlink target without replacing the link and rejects malformed files', async t => {
    const { dir, file } = await fixture(t); await add(file, 'root');
    const alias = join(dir, 'alias.blueprint.json'); await symlink(file, alias);
    assert.equal((await run('rename', alias, '--id', 'root', '--title', 'via alias')).ok, true);
    assert.equal((await run('show', file)).document.nodes[0].title, 'via alias');
    assert.equal(await readlink(alias), file);
    await writeFile(file, '{broken');
    assert.equal((await run('rename', alias, '--id', 'root', '--title', 'x')).ok, false);
    assert.equal(await readFile(file, 'utf8'), '{broken');
    assert.ok(!(await readdir(dir)).some(name => name.endsWith('.lock') || name.endsWith('.tmp')));
});
test('discovers the format without a file and treats satisfied moves as successful', async t => {
    const { stdout } = await exec(process.execPath, [cli, '--help']); assert.match(stdout, /--expect-revision/);
    assert.equal((await run('schema')).properties.version.const, 1);
    const { file } = await fixture(t); await add(file, 'a'); await add(file, 'b');
    assert.equal((await run('move', file, '--id', 'a', '--before', 'b')).ok, true);
    assert.equal((await run('move', file, '--id', 'b', '--after', 'a')).ok, true);
    assert.equal((await run('move', file, '--id', 'b', '--root')).ok, true);
});

test('rejects cycles and a tenth module while allowing leaves at the ninth level', async t => {
    const { file } = await fixture(t);
    for (let i = 0; i < 9; i++) await add(file, `m${i}`, 'module', i ? `m${i - 1}` : undefined);
    await add(file, 'leaf', 'feature', 'm8');
    const before = await readFile(file, 'utf8');
    assert.equal((await run('add', file, '--kind', 'module', '--title', 'too deep', '--parent', 'm8')).ok, false);
    assert.equal((await run('move', file, '--id', 'm0', '--inside', 'm8')).ok, false);
    assert.equal(await readFile(file, 'utf8'), before);
});

test('rejects malformed UTF-8 and unsupported versions without rewriting them', async t => {
    const { file } = await fixture(t);
    await add(file, 'root');
    const value = JSON.parse(await readFile(file, 'utf8'));
    const parts = JSON.stringify(value).replace('"title":"root"', '"title":"BADUTF8"').split('BADUTF8');
    const malformed = Buffer.concat([Buffer.from(parts[0]), Buffer.from([0xff]), Buffer.from(parts[1])]);
    for (const bytes of [
        Buffer.from(JSON.stringify({ ...value, version: 2 })),
        malformed,
    ]) {
        await writeFile(file, bytes);
        const result = await run('rename', file, '--id', 'root', '--title', 'new');
        assert.equal(result.ok, false);
        if (bytes === malformed) assert.equal(result.error.code, 'ERR_ENCODING_INVALID_ENCODED_DATA');
        assert.deepEqual(await readFile(file), bytes);
    }
});
