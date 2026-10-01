/** @jsxImportSource react */
/** Sidebar editing and local-file viewing through DSH's existing registrations. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { defineStore } from '@deepseek-ai/dsh-client-store';
import { IconWorkspaceTreeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsStore, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client';
import { mountBlueprint, type MountedBlueprint } from '../../../dist/mount.js';
import { type BlueprintEditorLabels } from '../../../dist/editor.js';
import type { BlueprintNode } from '../../../dist/model.js';
import { blueprintToolsZh, blueprintToolsEn } from '../../../dist/labels.js';
import style from '../../../src/style.css';
import { readBlueprintNodes } from './document.js';
import { registerCanvas } from './canvas.js';
import { FileEditor, type FileEditorState } from './file-editor.js';
import { documentText, fileContribution, type SaveFile, type SaveResult } from './file-rpc.js';

const NS = 'oneagentsBlueprint';
const ID = '@1agents/feature-blueprint';
const zh = {
    toolSearch: blueprintToolsZh.search,
    toolClearSearch: blueprintToolsZh.clearSearch,
    toolNoResults: blueprintToolsZh.noResults,
    toolExpandAll: blueprintToolsZh.expandAll,
    toolCollapseAll: blueprintToolsZh.collapseAll,
    toolCollapseToLevel: blueprintToolsZh.collapseToLevel,
    toolShortcuts: blueprintToolsZh.shortcuts,
    toolLinks: blueprintToolsZh.links,
    toolWebLink: blueprintToolsZh.webLink,
    toolNodeLink: blueprintToolsZh.nodeLink,
    toolNoteLink: blueprintToolsZh.noteLink,
    toolUrl: blueprintToolsZh.url,
    toolLinkTitle: blueprintToolsZh.linkTitle,
    toolAddLink: blueprintToolsZh.addLink,
    toolRemoveLink: blueprintToolsZh.removeLink,
    toolMissingLink: blueprintToolsZh.missingLink,
    toolInvalidUrl: blueprintToolsZh.invalidUrl,
    toolNotebook: blueprintToolsZh.notebook,
    toolNotebookHelp: blueprintToolsZh.notebookHelp,
    toolInvalidNotebook: blueprintToolsZh.invalidNotebook,
    toolNoteSnapshot: blueprintToolsZh.noteSnapshot,
    toolResults: '找到 {count} 个节点',
    title: '思维导图', description: '整理层级，拖拽调整模块和功能点',
    tree: '思维导图', rootDrop: '将模块拖到这里，移回一级目录',
    expand: '展开{title}', collapse: '折叠{title}', addModule: '添加模块', addFeature: '添加功能点',
    rename: '重命名', remove: '删除', name: '名称', save: '保存', cancel: '取消',
    empty: '添加模块，开始整理思维导图', module: '模块', feature: '功能点',
    viewLabel: '展示方式', listView: '大纲', mindmapView: '思维导图',
    zoomIn: '放大', zoomOut: '缩小', resetZoom: '重置缩放', fitCanvas: '适应画布', addRoot: '添加一级模块',
    notes: '备注', editNotes: '编辑备注', emptyNotes: '暂无备注',
    fileMode: '文件编辑 · 拖拽和修改会自动保存到文件',
    savingFile: '正在保存…', savedFile: '已保存到文件',
    saveFailed: '保存失败：{message}', conflict: '文件已被其他程序修改，请使用上方的重新加载按钮后再编辑。',
    downloadDraft: '下载未保存的修改',
    fileEmpty: '思维导图文件还没有节点', invalidFile: '无法读取思维导图文件：{message}',
};
const en: Record<keyof typeof zh, string> = {
    toolSearch: blueprintToolsEn.search,
    toolClearSearch: blueprintToolsEn.clearSearch,
    toolNoResults: blueprintToolsEn.noResults,
    toolExpandAll: blueprintToolsEn.expandAll,
    toolCollapseAll: blueprintToolsEn.collapseAll,
    toolCollapseToLevel: blueprintToolsEn.collapseToLevel,
    toolShortcuts: blueprintToolsEn.shortcuts,
    toolLinks: blueprintToolsEn.links,
    toolWebLink: blueprintToolsEn.webLink,
    toolNodeLink: blueprintToolsEn.nodeLink,
    toolNoteLink: blueprintToolsEn.noteLink,
    toolUrl: blueprintToolsEn.url,
    toolLinkTitle: blueprintToolsEn.linkTitle,
    toolAddLink: blueprintToolsEn.addLink,
    toolRemoveLink: blueprintToolsEn.removeLink,
    toolMissingLink: blueprintToolsEn.missingLink,
    toolInvalidUrl: blueprintToolsEn.invalidUrl,
    toolNotebook: blueprintToolsEn.notebook,
    toolNotebookHelp: blueprintToolsEn.notebookHelp,
    toolInvalidNotebook: blueprintToolsEn.invalidNotebook,
    toolNoteSnapshot: blueprintToolsEn.noteSnapshot,
    toolResults: '{count} matching nodes',
    title: 'Mind map', description: 'Organize modules and features by dragging their hierarchy',
    tree: 'Mind map', rootDrop: 'Drop a module here to move it to the top level',
    expand: 'Expand {title}', collapse: 'Collapse {title}', addModule: 'Add module', addFeature: 'Add feature',
    rename: 'Rename', remove: 'Delete', name: 'Name', save: 'Save', cancel: 'Cancel',
    empty: 'Add a module to start your mind map', module: 'Module', feature: 'Feature',
    viewLabel: 'View mode', listView: 'Outline', mindmapView: 'Mind map',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetZoom: 'Reset zoom', fitCanvas: 'Fit canvas', addRoot: 'Add top-level module',
    notes: 'Notes', editNotes: 'Edit notes', emptyNotes: 'No notes yet',
    fileMode: 'File editor · Moves and edits are saved automatically',
    savingFile: 'Saving…', savedFile: 'Saved to file',
    saveFailed: 'Save failed: {message}', conflict: 'The file changed in another program. Reload it using the toolbar before editing again.',
    downloadDraft: 'Download unsaved changes',
    fileEmpty: 'The mind map file has no nodes', invalidFile: 'Cannot read mind map file: {message}',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap { oneagentsBlueprint: keyof typeof zh }
}

/** One mind map per Session, shared by its sidebar panes. */
function createStore() {
    return defineStore({
        init: (): { nodes: BlueprintNode[] } => ({ nodes: [] }),
        persist: 'oneagents.feature-blueprint.v1',
        actions: { replace: (draft, nodes: readonly BlueprintNode[]) => { draft.nodes = [...nodes]; } },
    });
}
type BodyProps = PropsStore<ReturnType<typeof createStore>> & PropsLocale<typeof NS>;

/** React owns the container; Preact owns its descendants and is unmounted with it. */
function BlueprintBody({ useStore, actions, t }: BodyProps) {
    const storedNodes = useStore(state => state.nodes);
    const nodes = useMemo(() => readBlueprintNodes(storedNodes), [storedNodes]);
    return <BlueprintSurface nodes={nodes} t={t} canvasOnly onChange={next => actions.replace(next)} />;
}

/** Host data and locale shared by the browser editor and file viewer. */
interface SurfaceProps {
    nodes: readonly BlueprintNode[];
    t: BodyProps['t'];
    readOnly?: boolean;
    busy?: boolean;
    canvasOnly?: boolean;
    onChange: (nodes: readonly BlueprintNode[]) => void;
}

function BlueprintSurface({ nodes, t, readOnly, busy = false, canvasOnly = false, onChange }: SurfaceProps) {
    const element = useRef<HTMLDivElement>(null);
    const editor = useRef<MountedBlueprint>();
    const labels: BlueprintEditorLabels = {
        tree: t('tree'), rootDrop: t('rootDrop'), expand: title => t('expand', { title }), collapse: title => t('collapse', { title }),
        addModule: t('addModule'), addFeature: t('addFeature'), rename: t('rename'), remove: t('remove'),
        name: t('name'), save: t('save'), cancel: t('cancel'), empty: t(readOnly ? 'fileEmpty' : 'empty'), module: t('module'), feature: t('feature'),
        views: { label: t('viewLabel'), list: t('listView'), mindmap: t('mindmapView'), zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), resetZoom: t('resetZoom'), fitCanvas: t('fitCanvas'), addRoot: t('addRoot') },
        tools: {
            search: t('toolSearch'),
            clearSearch: t('toolClearSearch'),
            noResults: t('toolNoResults'),
            expandAll: t('toolExpandAll'),
            collapseAll: t('toolCollapseAll'),
            collapseToLevel: t('toolCollapseToLevel'),
            shortcuts: t('toolShortcuts'),
            links: t('toolLinks'),
            webLink: t('toolWebLink'),
            nodeLink: t('toolNodeLink'),
            noteLink: t('toolNoteLink'),
            url: t('toolUrl'),
            linkTitle: t('toolLinkTitle'),
            addLink: t('toolAddLink'),
            removeLink: t('toolRemoveLink'),
            missingLink: t('toolMissingLink'),
            invalidUrl: t('toolInvalidUrl'),
            notebook: t('toolNotebook'),
            notebookHelp: t('toolNotebookHelp'),
            invalidNotebook: t('toolInvalidNotebook'),
            noteSnapshot: t('toolNoteSnapshot'),
            results: count => t('toolResults', { count: String(count) }),
        },
        notes: { label: t('notes'), edit: t('editNotes'), empty: t('emptyNotes') },
    };
    const props = { nodes, labels, onChange, readOnly, canvasOnly, ...(canvasOnly ? { initialView: 'mindmap' as const, initialZoom: .85 } : {}) };
    useEffect(() => {
        editor.current = mountBlueprint(element.current!, props);
        return () => { editor.current?.dispose(); editor.current = undefined; };
    }, []);
    useEffect(() => { editor.current?.update(props); });
    useEffect(() => { if (element.current) element.current.inert = busy; }, [busy]);
    return <div ref={element} className="oneagents-blueprint-host" aria-busy={busy} />;
}

/** Render one complete supported JSON document, including parse failures in place. */
function BlueprintFileBody({ content, resourceAddress, t, saveFile }: DocumentPreviewProps & PropsLocale<typeof NS> & { saveFile: SaveFile }) {
    const parsed = useMemo(() => {
        if (content.kind !== 'bytes') return null;
        try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(content.data);
            documentText(text);
            return { text };
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }, [content]);
    if (!parsed) return null;
    if ('error' in parsed) return <p className="blueprint-file-notice" role="alert">{t('invalidFile', { message: parsed.error ?? '' })}</p>;
    return <BlueprintFileEditor key={resourceAddress} text={parsed.text} address={resourceAddress} t={t} saveFile={saveFile} />;
}

function BlueprintFileEditor({ text, address, t, saveFile }: { text: string; address: string; t: BodyProps['t']; saveFile: SaveFile }) {
    const [state, setState] = useState<FileEditorState>(() => ({ document: documentText(text), text, saving: false, saved: false }));
    const file = useRef<FileEditor>();
    const [download, setDownload] = useState<string>();
    useEffect(() => {
        const editor = new FileEditor(text, address, saveFile, setState);
        file.current = editor;
        setState(editor.state);
        return () => { editor.dispose(); file.current = undefined; };
    }, [address, saveFile]);
    useEffect(() => { file.current?.receive(text); }, [text]);
    useEffect(() => {
        if (!state.draft) { setDownload(undefined); return; }
        const url = URL.createObjectURL(new Blob([state.draft], { type: 'application/json' }));
        setDownload(url);
        return () => URL.revokeObjectURL(url);
    }, [state.draft]);
    return <div className="blueprint-file-view">
        {(state.saving || state.saved) && <p className="blueprint-file-notice" role="status">{t(state.saving ? 'savingFile' : 'savedFile')}</p>}
        {state.error && <p className="blueprint-file-notice" role="alert">
            {t('saveFailed', { message: state.error.code === 'REVISION_CONFLICT' ? t('conflict') : state.error.message })}
            {download && <> <a href={download} download="unsaved.blueprint.json">{t('downloadDraft')}</a></>}
        </p>}
        <BlueprintSurface nodes={state.document.nodes} t={t} busy={state.saving} canvasOnly
            onChange={nodes => { void file.current?.save(nodes); }} />
    </div>;
}

/** Required services for the existing sidebar and locale registrations. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'documentPreviews', 'remote'];

/**
 * Register the mind map page through DSH's sidebar extension points.
 * @param ctx - Browser context supplied by the Client loader.
 */
export async function apply(ctx: Context): Promise<void> {
    const remote = (ctx as unknown as { remote: {
        $mount: (definition: typeof fileContribution) => Promise<() => Promise<void>>;
        oneagentsBlueprintFiles: { save: (address: string, text: string, nodes: readonly BlueprintNode[], signal: AbortSignal) => Promise<
            { ok: true; value: SaveResult } | { ok: false; error: { code: string; message: string } }> };
    } }).remote;
    const release = await remote.$mount(fileContribution);
    ctx.effect(() => release);
    const saveFile: SaveFile = async (address, text, nodes, signal) => {
        const result = await remote.oneagentsBlueprintFiles.save(address, text, nodes, signal);
        return result.ok ? result.value : { ok: false, error: result.error };
    };
    registerCanvas(ctx);
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }));
    ctx.effect(() => {
        const sheet = document.createElement('style');
        sheet.textContent = style + `\n.oneagents-blueprint-host {
            height: 100%; overflow: auto; margin-right: 2px;
            --text-main: var(--dsw-alias-label-primary);
            --text-muted: var(--dsw-alias-label-secondary);
            --accent-color: var(--dsw-alias-label-primary);
            --btn-hover: var(--dsw-alias-interactive-bg-hover);
            --accent-light: var(--dsw-alias-interactive-bg-active);
        }
        .blueprint-file-view { position: relative; display: flex; flex-direction: column; min-height: 0; height: 100%; }
        .blueprint-file-view .oneagents-blueprint-host { flex: 1; min-height: 0; }
        .blueprint-file-notice { padding: 8px 12px; margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
        .blueprint-file-view > .blueprint-file-notice { position: absolute; top: 12px; left: 12px; z-index: 5; max-width: min(320px, calc(100% - 24px)); box-sizing: border-box; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 3px 16px #00000006; }`;
        document.head.append(sheet);
        return () => sheet.remove();
    });
    ctx.effect(() => ctx.sidebarRightTabs.register({
        id: ID, kind: 'oneagents-blueprint', keepMounted: true, priority: 'extension',
        title: () => t('title'),
        guide: [{ id: 'open', order: 45, title: () => t('title'), description: () => t('description'), icon: IconWorkspaceTreeOutlineRegular }],
    }));
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: ID, locale: NS, store: createStore(),
    }, BlueprintBody)));
    ctx.effect(() => ctx.documentPreviews.register({
        id: `${ID}/file`, extensions: ['blueprint.json'], priority: 'extension',
        title: () => t('title'), loading: 'bytes-complete', wrap: false,
    }));
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
        name: 'sidebar.right.tab.document', key: `${ID}/file`, locale: NS,
        inject: () => ({ saveFile }),
    }, BlueprintFileBody)));
}
