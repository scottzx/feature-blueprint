import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildFeatureTree, featureDropPlacement, filterFeatureTree, flattenFeatureTree,
    moveFeatureNode, resolveFeatureDrop, siblingNodes, validFeatureParents,
} from '../dist/model.js';

const node = (id, kind = 'module', parentId, position = 0) => ({
    id, title: id, kind, parentId, position, createdAt: '2026-01-01T00:00:00Z',
    projectMetadata: { retained: true },
});

test('preserves consumer fields, full ancestry and sibling order through filtering', () => {
    const nodes = [node('root'), node('child', 'module', 'root'), node('second', 'feature', 'child', 1), node('first', 'feature', 'child')];
    const flat = flattenFeatureTree(filterFeatureTree(buildFeatureTree(nodes), entry => entry.node.id === 'first'));
    assert.deepEqual(flat.map(entry => entry.node.id), ['root', 'child', 'first']);
    assert.deepEqual(flat.at(-1).path, ['root', 'child', 'first']);
    assert.strictEqual(flat.at(-1).node, nodes[3]);
});

test('keeps the original module-quarter and feature-half drag regions', () => {
    assert.equal(featureDropPlacement('module', .249), 'before');
    assert.equal(featureDropPlacement('module', .25), 'inside');
    assert.equal(featureDropPlacement('module', .75), 'inside');
    assert.equal(featureDropPlacement('module', .751), 'after');
    assert.equal(featureDropPlacement('feature', .49), 'before');
    assert.equal(featureDropPlacement('feature', .5), 'after');
});

test('reorders both directions without mutating nodes or losing metadata', () => {
    const nodes = [node('a'), node('b', 'module', undefined, 1), node('c', 'module', undefined, 2)];
    const result = moveFeatureNode(nodes, 'a', { targetId: 'b', placement: 'after' });
    assert.deepEqual(siblingNodes(result).map(n => [n.id, n.position]), [['b', 0], ['a', 1], ['c', 2]]);
    const back = moveFeatureNode(result, 'a', { targetId: 'b', placement: 'before' });
    assert.deepEqual(siblingNodes(back).map(n => n.id), ['a', 'b', 'c']);
    assert.deepEqual(nodes.map(n => n.position), [0, 1, 2]);
    assert.strictEqual(result[0].projectMetadata, nodes[0].projectMetadata);
});

test('reparents a subtree and renumbers its former siblings', () => {
    const nodes = [node('a'), node('b', 'module', undefined, 1), node('child', 'module', 'a'), node('leaf', 'feature', 'child'), node('remaining', 'feature', 'a', 1)];
    const moved = moveFeatureNode(nodes, 'child', { targetId: 'b', placement: 'inside' });
    assert.equal(moved.find(n => n.id === 'child').parentId, 'b');
    assert.equal(moved.find(n => n.id === 'remaining').position, 0);
    assert.equal(moved.find(n => n.id === 'leaf').parentId, 'child');
    const root = moveFeatureNode(moved, 'child', { placement: 'root' });
    assert.equal(root.find(n => n.id === 'child').parentId, undefined);
    assert.deepEqual(siblingNodes(root).map(n => n.id), ['a', 'b', 'child']);
});

test('rejects cycles, feature parents, feature roots, no-ops and excessive subtree depth', () => {
    const nodes = [node('a'), node('child', 'module', 'a'), node('leaf', 'feature', 'child')];
    for (const [id, target] of [
        ['a', { targetId: 'child', placement: 'inside' }],
        ['a', { targetId: 'leaf', placement: 'inside' }],
        ['leaf', { placement: 'root' }],
        ['a', { targetId: 'a', placement: 'before' }],
    ]) assert.strictEqual(moveFeatureNode(nodes, id, target), nodes);
    const deep = [...nodes, node('other')];
    assert.equal(resolveFeatureDrop(deep, 'a', { targetId: 'other', placement: 'inside' }, 2), null);
    assert.equal(validFeatureParents('module', deep, deep[0], 2).some(n => n.id === 'other'), false);
});
