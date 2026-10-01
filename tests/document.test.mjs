import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
    entryPoints: [fileURLToPath(new URL('../packages/dsh-plugin/src/document.ts', import.meta.url))],
    bundle: true, format: 'cjs', platform: 'node', write: false,
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports });
const { readBlueprintNodes } = module.exports;
const node = (id, kind = 'module', parentId) => ({ id, title: id, kind, parentId, position: 0, createdAt: '' });

test('restores valid nodes without losing consumer fields', () => {
    const nodes = [node('root'), { ...node('leaf', 'feature', 'root'), extra: 1 }];
    assert.strictEqual(readBlueprintNodes(nodes), nodes);
});

test('accepts optional multiline notes on modules and features, rejecting non-text notes', () => {
    for (const notes of [undefined, '', '第一行\n第二行']) {
        const nodes = [{ ...node('root'), notes }, { ...node('leaf', 'feature', 'root'), notes }];
        assert.strictEqual(readBlueprintNodes(nodes), nodes);
    }
    for (const notes of [null, 1, false, [], {}]) assert.throws(() => readBlueprintNodes([{ ...node('root'), notes }]));
});

test('rejects malformed fields and duplicate ids before recursive rendering', () => {
    for (const value of [null, {}, [null], [{ ...node('root'), position: '0' }], [{ ...node('root'), kind: 'unknown' }], [node('same'), node('same')]]) {
        assert.throws(() => readBlueprintNodes(value));
    }
});

test('rejects missing parents, feature parents, root features and cycles', () => {
    for (const nodes of [
        [node('leaf', 'feature')], [node('child', 'module', 'missing')],
        [node('root'), node('leaf', 'feature', 'root'), node('child', 'module', 'leaf')],
        [node('a', 'module', 'b'), node('b', 'module', 'a')],
    ]) assert.throws(() => readBlueprintNodes(nodes));
});

test('accepts nine module levels with feature leaves and rejects a tenth module', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => node(`m${i}`, 'module', i ? `m${i - 1}` : undefined));
    assert.doesNotThrow(() => readBlueprintNodes([...nodes, node('leaf', 'feature', 'm8')]));
    assert.throws(() => readBlueprintNodes([...nodes, node('m9', 'module', 'm8')]));
});
