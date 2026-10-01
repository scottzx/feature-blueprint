/** Interactive demo; the host provides notebook navigation and document export. */
import { blueprintToolsZh } from '../src/labels.js';
import notebook from './notebook.json';
import { mountBlueprint } from '../src/mount.js';
import type { BlueprintNode } from '../src/model.js';
import type { BlueprintEditorLabels } from '../src/editor.js';

const labels: BlueprintEditorLabels = {
    tree: '产品构思', rootDrop: '拖到这里，成为一级节点', expand: title => `展开${title}`, collapse: title => `折叠${title}`,
    addModule: '子节点', addFeature: '想法', rename: '重命名', remove: '删除', name: '节点名称',
    save: '完成', cancel: '取消', empty: '从第一个想法开始。', module: '节点', feature: '想法',
    views: { label: '展示方式', list: '大纲', mindmap: '导图', zoomIn: '放大', zoomOut: '缩小', resetZoom: '重置缩放', fitCanvas: '适应画布', addRoot: '新建分支' },
    tools: { ...blueprintToolsZh, search: '搜索想法与资料', expandAll: '展开', collapseAll: '折叠', collapseToLevel: '层级', notebook: '笔记目录', links: '关联资料', linkTitle: '标题（可选）' },
    notes: { label: '节点笔记', edit: '写笔记', empty: '把更多细节，留在这里。' },
};
const canvasOnly = new URLSearchParams(location.search).get('mode') === 'sidebar';
if (canvasOnly) document.body.classList.add('canvas-demo');
const createdAt = '2026-10-02T00:00:00.000Z';
let nodes: readonly BlueprintNode[] = [
    { id: 'capture', title: '捕捉灵感', kind: 'module', position: 0, createdAt },
    { id: 'brainstorm', title: '自由头脑风暴', kind: 'feature', parentId: 'capture', position: 0, createdAt },
    { id: 'quick', title: '记录一闪而过的想法', kind: 'feature', parentId: 'capture', position: 1, createdAt, notes: '不用急着整理。先把想到的写下来，再慢慢连接。' },
    { id: 'organize', title: '梳理思路', kind: 'module', position: 1, createdAt },
    { id: 'outline', title: '用大纲建立结构', kind: 'feature', parentId: 'organize', position: 0, createdAt },
    { id: 'hierarchy', title: '拖拽，找到更好的顺序', kind: 'feature', parentId: 'organize', position: 1, createdAt },
    { id: 'connect', title: '连接知识', kind: 'module', position: 2, createdAt },
    { id: 'notes', title: '让笔记彼此相连', kind: 'feature', parentId: 'connect', position: 0, createdAt, links: [{ kind: 'note', noteId: 'interviews', title: '用户访谈', content: notebook.notes[0].content }] },
    { id: 'reference', title: '收集有价值的资料', kind: 'feature', parentId: 'connect', position: 1, createdAt, links: [{ kind: 'node', nodeId: 'brainstorm' }] },
];
const dialog = document.getElementById('note-dialog') as HTMLDialogElement;
function onOpenNote(id: string) {
    const note = notebook.notes.find(note => note.id === id);
    if (!note) return;
    document.getElementById('note-dialog-title')!.textContent = note.title;
    document.getElementById('note-dialog-content')!.textContent = note.content ?? '暂无正文';
    const link = document.getElementById('note-dialog-link') as HTMLAnchorElement;
    link.hidden = !note.url;
    if (note.url) link.href = note.url;
    else link.removeAttribute('href');
    dialog.showModal();
}
document.getElementById('close-note')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
const noteList = document.getElementById('notebook-list')!;
for (const note of notebook.notes) {
    const button = document.createElement('button');
    button.type = 'button';
    const icon = document.createElement('span'); icon.className = 'note-icon'; icon.textContent = '≡'; icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span'); const title = document.createElement('strong'); title.textContent = note.title;
    const section = document.createElement('span'); section.textContent = note.section ?? '未分组';
    copy.append(title, section); button.append(icon, copy); button.addEventListener('click', () => onOpenNote(note.id)); noteList.append(button);
}
const onChange = (next: readonly BlueprintNode[]) => {
    nodes = next;
    editor.update({ nodes, labels, onChange, notebook, onOpenNote, canvasOnly });
    document.getElementById('node-count')!.textContent = `${nodes.length} 个节点`;
    document.getElementById('edit-status')!.textContent = '已更新 · 当前演示';
};
const editor = mountBlueprint(document.getElementById('app')!, { nodes, labels, onChange, notebook, onOpenNote, canvasOnly, initialView: 'mindmap', initialZoom: canvasOnly ? .85 : .9 });
document.getElementById('generate-directory')!.addEventListener('click', () => document.querySelector<HTMLButtonElement>('[data-blueprint-action="notebook"]')?.click());
document.getElementById('export')!.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: '1agents.feature-blueprint', version: 1, nodes }, null, 2)], { type: 'application/json' }));
    const download = document.createElement('a'); download.href = url; download.download = '产品构思.blueprint.json'; download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById('edit-status')!.textContent = '导图已导出';
});
