/** @jsxImportSource react */
/** Sidebar editing and local-file viewing through DSH's existing registrations. */
import { useEffect, useMemo, useRef } from 'react';
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
import style from '../../../src/style.css';
import { readBlueprintNodes, readBlueprintDocument } from './document.js';

const NS = 'oneagentsBlueprint';
const ID = '@1agents/feature-blueprint';
const zh = {
    title: '功能蓝图', description: '整理层级，拖拽调整模块和功能点',
    tree: '功能蓝图树', rootDrop: '将模块拖到这里，移回一级目录',
    expand: '展开{title}', collapse: '折叠{title}', addModule: '添加模块', addFeature: '添加功能点',
    rename: '重命名', remove: '删除', name: '名称', save: '保存', cancel: '取消',
    empty: '添加模块，开始整理功能蓝图', module: '模块', feature: '功能点',
    viewLabel: '蓝图视图', listView: '列表', mindmapView: '思维导图',
    zoomIn: '放大', zoomOut: '缩小', resetZoom: '重置缩放', addRoot: '添加一级模块',
    notes: '备注', editNotes: '编辑备注', emptyNotes: '暂无备注',
    fileMode: '文件预览 · 通过 blueprint CLI 修改，文件变化后自动刷新',
    fileEmpty: '蓝图文件还没有节点', invalidFile: '无法读取蓝图文件：{message}',
};
const en: Record<keyof typeof zh, string> = {
    title: 'Feature blueprint', description: 'Organize modules and features by dragging their hierarchy',
    tree: 'Feature blueprint tree', rootDrop: 'Drop a module here to move it to the top level',
    expand: 'Expand {title}', collapse: 'Collapse {title}', addModule: 'Add module', addFeature: 'Add feature',
    rename: 'Rename', remove: 'Delete', name: 'Name', save: 'Save', cancel: 'Cancel',
    empty: 'Add a module to start your blueprint', module: 'Module', feature: 'Feature',
    viewLabel: 'Blueprint view', listView: 'List', mindmapView: 'Mind map',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetZoom: 'Reset zoom', addRoot: 'Add top-level module',
    notes: 'Notes', editNotes: 'Edit notes', emptyNotes: 'No notes yet',
    fileMode: 'File preview · Edit with the blueprint CLI; file changes refresh automatically',
    fileEmpty: 'The blueprint file has no nodes', invalidFile: 'Cannot read blueprint file: {message}',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap { oneagentsBlueprint: keyof typeof zh }
}

/** One blueprint per Session, shared by its sidebar panes. */
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
    return <BlueprintSurface nodes={nodes} t={t} onChange={next => actions.replace(next)} />;
}

/** Host data and locale shared by the browser editor and file viewer. */
interface SurfaceProps {
    nodes: readonly BlueprintNode[];
    t: BodyProps['t'];
    readOnly?: boolean;
    onChange: (nodes: readonly BlueprintNode[]) => void;
}

function BlueprintSurface({ nodes, t, readOnly, onChange }: SurfaceProps) {
    const element = useRef<HTMLDivElement>(null);
    const editor = useRef<MountedBlueprint>();
    const labels: BlueprintEditorLabels = {
        tree: t('tree'), rootDrop: t('rootDrop'), expand: title => t('expand', { title }), collapse: title => t('collapse', { title }),
        addModule: t('addModule'), addFeature: t('addFeature'), rename: t('rename'), remove: t('remove'),
        name: t('name'), save: t('save'), cancel: t('cancel'), empty: t(readOnly ? 'fileEmpty' : 'empty'), module: t('module'), feature: t('feature'),
        views: { label: t('viewLabel'), list: t('listView'), mindmap: t('mindmapView'), zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), resetZoom: t('resetZoom'), addRoot: t('addRoot') },
        notes: { label: t('notes'), edit: t('editNotes'), empty: t('emptyNotes') },
    };
    const props = { nodes, labels, onChange, readOnly };
    useEffect(() => {
        editor.current = mountBlueprint(element.current!, props);
        return () => { editor.current?.dispose(); editor.current = undefined; };
    }, []);
    useEffect(() => { editor.current?.update(props); });
    return <div ref={element} className="oneagents-blueprint-host" />;
}

/** Render one complete supported JSON document, including parse failures in place. */
function BlueprintFileBody({ content, resourceAddress, t }: DocumentPreviewProps & PropsLocale<typeof NS>) {
    const parsed = useMemo(() => {
        if (content.kind !== 'bytes') return null;
        try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(content.data);
            return { nodes: readBlueprintDocument(JSON.parse(text)).nodes };
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }, [content]);
    if (!parsed) return null;
    if ('error' in parsed) return <p className="blueprint-file-notice" role="alert">{t('invalidFile', { message: parsed.error ?? '' })}</p>;
    return <div className="blueprint-file-view">
        <p className="blueprint-file-notice">{t('fileMode')}</p>
        <BlueprintSurface key={resourceAddress} nodes={parsed.nodes} t={t} readOnly onChange={() => {}} />
    </div>;
}

/** Required services for the existing sidebar and locale registrations. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'documentPreviews'];

/**
 * Register the blueprint page through DSH's sidebar extension points.
 * @param ctx - Browser context supplied by the Client loader.
 */
export function apply(ctx: Context): void {
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
        .blueprint-file-view { display: flex; flex-direction: column; min-height: 0; height: 100%; }
        .blueprint-file-view .oneagents-blueprint-host { flex: 1; min-height: 0; }
        .blueprint-file-notice { padding: 8px 12px; margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }`;
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
    }, BlueprintFileBody)));
}
