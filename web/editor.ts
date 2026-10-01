/** The CLI serves this editor with one file and its revision; the file owns all data. */
import { mountBlueprint } from '../src/mount.js';
import type { BlueprintEditorLabels } from '../src/editor.js';
import type { BlueprintDocument } from '../src/document.js';
import type { BlueprintNode } from '../src/model.js';

const labels: BlueprintEditorLabels = {
    tree: '功能蓝图', rootDrop: '将模块拖到这里，移回一级目录', expand: title => `展开${title}`, collapse: title => `折叠${title}`,
    addModule: '添加模块', addFeature: '添加功能点', rename: '重命名', remove: '删除', name: '名称',
    save: '保存', cancel: '取消', empty: '添加模块，开始整理功能蓝图', module: '模块', feature: '功能点',
    views: { label: '蓝图视图', list: '列表', mindmap: '思维导图', zoomIn: '放大', zoomOut: '缩小', resetZoom: '重置缩放', addRoot: '添加一级模块' },
    notes: { label: '备注', edit: '编辑备注', empty: '暂无备注' },
};
type FileState = { path: string; revision: string; document: BlueprintDocument };
const container = document.getElementById('app')!;
const status = document.getElementById('save-status')!;
const errorBox = document.getElementById('file-error')!;
let current: FileState;
let editor: ReturnType<typeof mountBlueprint>;
let saving = false;
let refreshing = false;
const showError = (message: string) => { errorBox.hidden = false; errorBox.textContent = message; };
async function request(init?: RequestInit): Promise<FileState> {
    const response = await fetch('api/document', { cache: 'no-store', ...init });
    const value = await response.json();
    if (!response.ok) throw new Error(value.code === 'REVISION_CONFLICT'
        ? '文件已由其他程序修改，请重新读取后再编辑。' : value.error ?? '无法读写文件');
    return value;
}
const props = () => ({ nodes: current.document.nodes, labels, onChange });
async function save(nodes: readonly BlueprintNode[]) {
    if (saving) return;
    saving = true;
    container.inert = true;
    container.setAttribute('aria-busy', 'true');
    status.textContent = '正在保存…';
    errorBox.hidden = true;
    try {
        current = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes, revision: current.revision }) });
        editor.update(props());
        status.textContent = '已保存到文件';
    } catch (error) {
        // Retain the submitted draft for recovery while the committed file stays untouched.
        const draft = JSON.stringify({ ...current.document, nodes }, null, 2);
        showError(error instanceof Error ? error.message : String(error));
        const download = document.createElement('a');
        const blobUrl = URL.createObjectURL(new Blob([draft], { type: 'application/json' }));
        download.href = blobUrl; download.download = 'unsaved.blueprint.json'; download.textContent = '下载未保存的修改';
        errorBox.append(' ', download);
        download.onclick = () => setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        status.textContent = '保存失败';
        try { current = await request(); editor.update(props()); } catch { /* Keep the last known valid file. */ }
    } finally {
        saving = false; container.inert = false; container.removeAttribute('aria-busy');
    }
}
function onChange(nodes: readonly BlueprintNode[]) { void save(nodes); }
async function refresh() {
    if (saving || refreshing) return;
    refreshing = true;
    const revision = current.revision;
    try {
        const next = await request();
        if (!saving && current.revision === revision && next.revision !== current.revision) {
            current = next; editor.update(props()); status.textContent = '已跟随文件更新';
        }
    } catch (error) { showError(error instanceof Error ? error.message : String(error)); }
    finally { refreshing = false; }
}
try {
    current = await request();
    document.getElementById('file-path')!.textContent = current.path;
    editor = mountBlueprint(container, { ...props(), initialView: 'mindmap' });
    status.textContent = '已读取 · 修改会保存到文件';
    setInterval(() => { void refresh(); }, 2000);
} catch (error) { status.textContent = '读取失败'; showError(error instanceof Error ? error.message : String(error)); }
