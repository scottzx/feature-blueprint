import assert from 'node:assert/strict';
import test from 'node:test';
import { h } from 'preact';
import render from 'preact-render-to-string';
import { BlueprintTree } from '../dist/tree.js';
import { buildFeatureTree } from '../dist/model.js';
import { BlueprintEditor } from '../dist/editor.js';

const nodes = [
    { id: 'root', title: 'Root', kind: 'module', position: 0, createdAt: '' },
    { id: 'leaf', title: 'Leaf', kind: 'feature', parentId: 'root', position: 0, createdAt: '', progress: 42 },
];
const props = {
    nodes, tree: buildFeatureTree(nodes), selectedId: 'root', collapsedIds: new Set(), filtering: false, dragDisabled: false,
    labels: { tree: 'Tree', rootDrop: 'Root drop', expand: title => `Expand ${title}`, collapse: title => `Collapse ${title}` },
    onSelect() {}, onToggleCollapsed() {}, async onMove() {},
    renderProgress: node => node.progress ? h('span', null, `Progress ${node.progress}`) : null,
    renderActions: entry => h('button', null, `Actions ${entry.node.id}`),
};

test('retains host decorations, selected row, accessibility names and original class hooks', () => {
    const html = render(h(BlueprintTree, props));
    assert.match(html, /feature-tree-row selected/);
    assert.match(html, /aria-label="Collapse Root"/);
    assert.match(html, /Progress 42/);
    assert.match(html, /Actions leaf/);
    assert.match(html, /Root drop/);
});

test('collapse hides descendants, filtering reveals them, and readonly rows cannot drag', () => {
    const collapsed = { ...props, collapsedIds: new Set(['root']), dragDisabled: true };
    assert.doesNotMatch(render(h(BlueprintTree, collapsed)), /data-blueprint-id="leaf"/);
    const filtered = render(h(BlueprintTree, { ...collapsed, filtering: true }));
    assert.match(filtered, /data-blueprint-id="leaf"/);
    assert.match(filtered, /draggable="false"/);
});

test('an empty filter retains the disabled root drop zone without drawing an empty tree', () => {
    const html = render(h(BlueprintTree, { ...props, tree: [], filtering: true, dragDisabled: true }));
    assert.doesNotMatch(html, /<ul/);
    assert.match(html, /feature-root-drop disabled/);
    assert.match(html, /Root drop/);
});

test('file mode presents the same nodes and collapse controls without edit controls', () => {
    const html = render(h(BlueprintEditor, {
        nodes, readOnly: true, onChange() {},
        labels: { ...props.labels, empty: 'Empty', addModule: 'Add module', addFeature: 'Add feature', rename: 'Rename', remove: 'Delete' },
    }));
    assert.match(html, /data-blueprint-id="leaf"/);
    assert.match(html, /aria-label="Collapse Root"/);
    assert.match(html, /draggable="false"/);
    assert.doesNotMatch(html, /blueprint-toolbar|blueprint-form|Add module|Rename|Delete/);
});

const views = { label: 'View', list: 'List', mindmap: 'Mind map', zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetZoom: 'Reset zoom', addRoot: 'Add root' };

test('mind map preserves ordering, selection, decorations and collapsed descendants', () => {
    const html = render(h(BlueprintTree, { ...props, presentation: 'mindmap' }));
    assert.match(html, /feature-tree feature-mindmap/);
    assert.match(html, /feature-tree-row selected/);
    assert.match(html, /Progress 42/);
    assert.ok(html.indexOf('data-blueprint-id="root"') < html.indexOf('data-blueprint-id="leaf"'));
    const collapsed = render(h(BlueprintTree, { ...props, presentation: 'mindmap', collapsedIds: new Set(['root']) }));
    assert.doesNotMatch(collapsed, /data-blueprint-id="leaf"/);
    assert.match(collapsed, /aria-label="Expand Root"/);
});

test('file mind map offers view and zoom controls while retaining readonly nodes', () => {
    const html = render(h(BlueprintEditor, {
        nodes, initialView: 'mindmap', readOnly: true, onChange() {},
        labels: { ...props.labels, views },
    }));
    assert.match(html, /aria-pressed="true">Mind map/);
    assert.match(html, /blueprint-map-viewport/);
    assert.match(html, /data-blueprint-id="leaf"/);
    assert.match(html, /draggable="false"/);
    assert.match(html, /aria-label="Reset zoom"/);
    assert.doesNotMatch(html, /blueprint-toolbar|blueprint-form|Add root/);
});

test('existing editor embeddings default to the list and need no new labels', () => {
    const html = render(h(BlueprintEditor, { nodes, labels: props.labels, onChange() {} }));
    assert.match(html, /class="feature-tree"/);
    assert.doesNotMatch(html, /blueprint-viewbar|blueprint-map-viewport/);
});

test('both presentations show remarks as plain text without interpreting markup', () => {
    const nodesWithNotes = nodes.map(node => ({ ...node, notes: 'First line\n<script>alert(1)</script>' }));
    for (const presentation of ['list', 'mindmap']) {
        const html = render(h(BlueprintTree, { ...props, nodes: nodesWithNotes, tree: buildFeatureTree(nodesWithNotes), presentation }));
        assert.match(html, /feature-tree-note/);
        assert.match(html, /First line/);
        assert.match(html, /&lt;script>/);
        assert.doesNotMatch(html, /<script>/);
    }
});

test('optional organization controls stay available in readonly views without mutation tools', async () => {
    const { blueprintToolsEn: tools } = await import('../dist/labels.js');
    const html = render(h(BlueprintEditor, { nodes, readOnly: true, onChange() {}, labels: { ...props.labels, views, tools } }));
    assert.match(html, /Search nodes, notes and references/);
    assert.match(html, /Expand all/);
    assert.match(html, /Collapse all/);
    assert.doesNotMatch(html, /Generate note directory|blueprint-link-form|type="file"|blueprint-toolbar/);
});

test('canvas-only sidebar starts in the map and omits workspace tools while keeping accessible editing', async () => {
    const { blueprintToolsEn: tools } = await import('../dist/labels.js');
    const labels = { ...props.labels, views, tools, addModule: 'Add module', addFeature: 'Add feature', rename: 'Rename', remove: 'Delete' };
    const html = render(h(BlueprintEditor, { nodes, canvasOnly: true, initialZoom: .85, labels, onChange() {} }));
    assert.match(html, /blueprint-canvas-only/);
    assert.match(html, /blueprint-map-viewport/);
    assert.match(html, /aria-label="Add root"/);
    assert.match(html, /aria-label="Zoom in"/);
    assert.match(html, /zoom:0.85/);
    assert.doesNotMatch(html, /blueprint-organize|blueprint-view-switch|blueprint-shortcuts|blueprint-notebook-info|Generate note directory|type="file"/);
    const readonly = render(h(BlueprintEditor, { nodes, canvasOnly: true, readOnly: true, labels, onChange() {} }));
    assert.doesNotMatch(readonly, /blueprint-toolbar/);
    assert.match(readonly, /draggable="false"/);
});
