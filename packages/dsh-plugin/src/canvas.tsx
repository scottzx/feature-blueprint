/** @jsxImportSource react */
import { useEffect, useMemo, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { defineStore } from '@deepseek-ai/dsh-client-store';
import { IconWorkspaceTreeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsStore, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client';
import { emptyCanvasScene, readCanvasScene, type CanvasScene } from '../../../canvas/src/scene.js';
import type * as Runtime from './canvas-runtime.js';

// DSH's package-local chunk contract. Its factory supplies this require.
declare const require: { async(path: string): Promise<unknown> };
const ID = '@1agents/feature-blueprint/canvas';
const NS = 'oneagentsCanvas';
const zh = {
    title: '自由画布', description: '用 Excalidraw 绘图、连线和整理想法',
    loading: '正在加载画布…', failed: '无法打开画布：{message}', retry: '重试',
    fileMode: '画布文件预览',
};
const en: Record<keyof typeof zh, string> = {
    title: 'Free canvas', description: 'Draw, connect and organize ideas with Excalidraw',
    loading: 'Loading canvas…', failed: 'Cannot open canvas: {message}', retry: 'Retry',
    fileMode: 'Canvas file preview',
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap { oneagentsCanvas: keyof typeof zh }
}
function createStore() {
    return defineStore({
        init: () => ({ scene: emptyCanvasScene() }),
        persist: 'oneagents.excalidraw.v1',
        actions: { replace: (draft, scene: CanvasScene) => { draft.scene = readCanvasScene(scene); } },
    });
}
type CanvasProps = PropsStore<ReturnType<typeof createStore>> & PropsLocale<typeof NS>;
type SurfaceProps = PropsLocale<typeof NS> & { scene: CanvasScene; readOnly?: boolean; onChange?: (scene: CanvasScene) => void };

/** Follow DSH's resolved theme, including its explicit override of the OS preference. */
function useCanvasTheme(): 'light' | 'dark' {
    const read = (): 'light' | 'dark' => document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
    const [theme, setTheme] = useState(read);
    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(read()));
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        return () => observer.disconnect();
    }, []);
    return theme;
}

function CanvasSurface({ scene, readOnly, onChange, t }: SurfaceProps) {
    const [runtime, setRuntime] = useState<typeof Runtime>();
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const theme = useCanvasTheme();
    useEffect(() => {
        let disposed = false;
        let release: (() => void) | undefined;
        setError('');
        require.async('./client.canvas.js').then(value => {
            if (disposed) return;
            const loaded = value as typeof Runtime;
            release = loaded.retainCanvasStyle();
            setRuntime(loaded);
        }).catch(error => { if (!disposed) setError(error instanceof Error ? error.message : String(error)); });
        return () => { disposed = true; release?.(); };
    }, [attempt]);
    if (error) return <div className="oneagents-canvas-notice" role="alert">
        <p>{t('failed', { message: error })}</p><button onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button>
    </div>;
    if (!runtime) return <p className="oneagents-canvas-notice" role="status">{t('loading')}</p>;
    return <runtime.CanvasEditor initialData={scene} scene={scene} onChange={onChange} readOnly={readOnly} theme={theme} />;
}

function CanvasBody({ useStore, actions, t }: CanvasProps) {
    const scene = useStore(state => state.scene);
    const parsed = useMemo(() => {
        try { return { scene: readCanvasScene(scene) }; }
        catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    }, [scene]);
    if (!parsed.scene) return <p className="oneagents-canvas-notice" role="alert">{t('failed', { message: parsed.error })}</p>;
    return <CanvasSurface scene={parsed.scene} onChange={next => actions.replace(next)} t={t} />;
}

function CanvasFileBody({ content, resourceAddress, t }: DocumentPreviewProps & PropsLocale<typeof NS>) {
    const parsed = useMemo(() => {
        if (content.kind !== 'bytes') return null;
        try {
            return { scene: readCanvasScene(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content.data))) };
        } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    }, [content]);
    if (!parsed) return null;
    if (!parsed.scene) return <p className="oneagents-canvas-notice" role="alert">{t('failed', { message: parsed.error })}</p>;
    return <div className="oneagents-canvas-file">
        <p className="oneagents-canvas-notice">{t('fileMode')}</p>
        <CanvasSurface key={resourceAddress} scene={parsed.scene} readOnly t={t} />
    </div>;
}

/** One separate sidebar type and native Excalidraw file viewer under the same package. */
export function registerCanvas(ctx: Context): void {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }));
    ctx.effect(() => {
        const sheet = document.createElement('style');
        sheet.textContent = `.oneagents-canvas-surface { min-width: 0; container-type: inline-size; }
            .oneagents-canvas-surface .excalidraw .App-toolbar--mobile {
                max-width: calc(100cqw - 28px); overflow-x: auto;
            }
            .oneagents-canvas-surface .excalidraw .App-toolbar--mobile > .Stack { width: max-content; }
            .oneagents-canvas-file { height: 100%; display: flex; flex-direction: column; min-height: 0; }
            .oneagents-canvas-file .oneagents-canvas-surface { flex: 1; }
            .oneagents-canvas-notice { font-size: 12px; padding: 8px 12px; margin: 0; color: var(--dsw-alias-label-secondary); }`;
        document.head.append(sheet);
        return () => sheet.remove();
    });
    ctx.effect(() => ctx.sidebarRightTabs.register({
        id: ID, kind: 'oneagents-canvas', keepMounted: true, priority: 'extension', title: () => t('title'),
        guide: [{ id: 'open', order: 46, title: () => t('title'), description: () => t('description'), icon: IconWorkspaceTreeOutlineRegular }],
    }));
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: ID, locale: NS, store: createStore(),
    }, CanvasBody)));
    ctx.effect(() => ctx.documentPreviews.register({
        id: `${ID}/file`, extensions: ['excalidraw'], priority: 'extension', title: () => t('title'), loading: 'bytes-complete', wrap: false,
    }));
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
        name: 'sidebar.right.tab.document', key: `${ID}/file`, locale: NS,
    }, CanvasFileBody)));
}
