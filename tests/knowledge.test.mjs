import assert from 'node:assert/strict';
import test from 'node:test';
import { appendNotebookDirectory, readBlueprintNotebook, buildFeatureTree, filterFeatureTree, flattenFeatureTree,
    matchesBlueprintQuery, moveFeatureNode, isBlueprintWebUrl } from '../dist/model.js';
import { readBlueprintDocument } from '../dist/document.js';
const timestamp = '2026-10-02T00:00:00.000Z';
const node = (id, fields = {}) => ({ id, title: id, kind: 'module', position: 0, createdAt: timestamp, ...fields });
const document = nodes => ({ format: '1agents.feature-blueprint', version: 1, nodes });

test('references validate and roundtrip without changing old documents or extension fields', () => {
    const value = document([node('a', { extra: 1, links: [
        { kind: 'web', url: 'https://example.com/资料', title: 'Reference', extra: 2 },
        { kind: 'node', nodeId: 'missing' },
        { kind: 'note', noteId: 'n', title: 'Note', content: 'Offline\ncontent' },
    ] })]);
    assert.deepEqual(readBlueprintDocument(value), value);
    assert.deepEqual(readBlueprintDocument(document([node('old')])), document([node('old')]));
    for (const link of [null, {}, { kind: 'other' }, { kind: 'web', url: 'javascript:alert(1)' },
        { kind: 'web', url: 'data:text/html,hi' }, { kind: 'web', url: 'file:///tmp/a' },
        { kind: 'node', nodeId: '' }, { kind: 'note', noteId: 'n', title: ' ' },
        { kind: 'note', noteId: 'n', title: 'Note', content: 2 }]) {
        assert.throws(() => readBlueprintDocument(document([node('bad', { links: [link] })])));
    }
    for (const links of [null, 'text', {}]) assert.throws(() => readBlueprintDocument(document([node('bad', { links })])));
});

test('URL checks reject unsafe schemes, incomplete addresses and credentials', () => {
    for (const url of ['https://example.com', 'HTTP://example.com/a?q=1#b']) assert.equal(isBlueprintWebUrl(url), true);
    for (const url of ['javascript:alert(1)', 'https://', '//example.com', '/path', 'https://user:secret@example.com', 12]) assert.equal(isBlueprintWebUrl(url), false);
});

test('search finds hidden remarks, note snapshots and linked titles and retains only ancestor paths', () => {
    const nodes = [node('root'), node('child', { parentId: 'root', notes: '独有内容' }), node('other'),
        node('linked', { links: [{ kind: 'node', nodeId: 'child' }] }),
        node('note', { links: [{ kind: 'note', noteId: 'n', title: 'Reference', content: 'snapshot words' }] }),
    ];
    const ids = flattenFeatureTree(filterFeatureTree(buildFeatureTree(nodes), entry => matchesBlueprintQuery(entry.node, '独有', nodes))).map(entry => entry.node.id);
    assert.deepEqual(ids, ['root', 'child']);
    assert.equal(matchesBlueprintQuery(nodes[3], 'CHILD', nodes), true);
    assert.equal(matchesBlueprintQuery(nodes[4], 'snapshot', nodes), true);
    assert.equal(matchesBlueprintQuery(nodes[0], 'missing', nodes), false);
    assert.equal(filterFeatureTree(buildFeatureTree(nodes), entry => matchesBlueprintQuery(entry.node, 'missing', nodes)).length, 0);
});

test('linked node identity survives rename and hierarchy changes', () => {
    const nodes = [node('a'), node('b'), node('ref', { links: [{ kind: 'node', nodeId: 'a' }] })];
    const renamed = nodes.map(value => value.id === 'a' ? { ...value, title: 'Updated' } : value);
    const moved = moveFeatureNode(renamed, 'a', { placement: 'inside', targetId: 'b' });
    assert.equal(matchesBlueprintQuery(moved.find(value => value.id === 'ref'), 'Updated', moved), true);
    assert.deepEqual(moved.find(value => value.id === 'ref').links, nodes[2].links);
});

test('notebook directory appends ordered groups, note references and offline snapshots with unique node ids', () => {
    const existing = [node('existing', { extra: 'keep' })];
    const book = { title: '研究笔记', notes: [
        { id: 'n1', title: '第一篇', section: '研究', content: '正文', url: 'https://example.com/n1' },
        { id: 'n2', title: '第二篇', section: '研究' },
        { id: 'n3', title: '第三篇' },
    ] };
    let serial = 0;
    const result = appendNotebookDirectory(existing, book, () => `generated-${++serial}`, timestamp);
    readBlueprintDocument(document(result));
    assert.equal(result[0], existing[0]);
    assert.equal(existing.length, 1);
    assert.deepEqual(flattenFeatureTree(buildFeatureTree(result)).map(entry => entry.node.title), ['existing', '研究笔记', '研究', '第一篇', '第二篇', '第三篇']);
    const first = result.find(value => value.title === '第一篇');
    assert.equal(first.notes, '正文');
    assert.deepEqual(first.links, [{ kind: 'note', noteId: 'n1', title: '第一篇', url: 'https://example.com/n1', content: '正文' }]);
    const again = appendNotebookDirectory(result, book, () => `generated-${++serial}`, timestamp);
    assert.equal(new Set(again.map(value => value.id)).size, again.length);
    assert.throws(() => appendNotebookDirectory(existing, book, () => 'existing', timestamp));
});

test('invalid notebooks fail before creating a directory', () => {
    for (const value of [null, {}, { title: 'Book', notes: {} }, { title: ' ', notes: [] },
        ...[[null], [{ id: 'n', title: 'One' }, { id: 'n', title: 'Two' }], [{ id: 'n', title: 'N', content: 1 }],
            [{ id: 'n', title: 'N', url: 'javascript:alert(1)' }], [{ id: 'n', title: 'N', section: {} }]]
            .map(notes => ({ title: 'Book', notes })),
    ]) assert.throws(() => readBlueprintNotebook(value));
    assert.deepEqual(readBlueprintNotebook({ title: 'Empty', notes: [] }), { title: 'Empty', notes: [] });
});

test('notebook directories append after sparse root positions', () => {
    const existing = [node('root', { position: 200 })];
    const result = appendNotebookDirectory(existing, { title: 'Book', notes: [] }, () => 'book', timestamp);
    assert.deepEqual(buildFeatureTree(result).map(entry => entry.node.id), ['root', 'book']);
});
