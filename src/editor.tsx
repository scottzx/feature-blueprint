/** A small mind map editor for embeddings without project-management services. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
    buildFeatureTree, moveFeatureNode, siblingNodes, featureDescendantIds,
    validFeatureParents, MAX_FEATURE_MODULE_DEPTH, type BlueprintNode,
} from './model.js';
import { BlueprintTree, type BlueprintTreeLabels, type BlueprintView } from './tree.js';

/** All editor text is supplied by the embedding. */
export interface BlueprintEditorLabels extends BlueprintTreeLabels {
    addModule: string;
    addFeature: string;
    rename: string;
    remove: string;
    name: string;
    save: string;
    cancel: string;
    empty: string;
    module: string;
    feature: string;
    /** Optional localized remarks controls; existing embeddings remain compatible. */
    notes?: { label: string; edit: string; empty: string };
    /** Supply localized view controls to enable switching in existing embeddings. */
    views?: {
        label: string;
        list: string;
        mindmap: string;
        zoomIn: string;
        zoomOut: string;
        resetZoom: string;
        addRoot: string;
    };
}

/** The host owns node persistence; local state contains selection and gestures only. */
export interface BlueprintEditorProps {
    nodes: readonly BlueprintNode[];
    labels: BlueprintEditorLabels;
    onChange: (nodes: readonly BlueprintNode[]) => void;
    /** File viewers retain selection and collapse controls without mutation gestures. */
    readOnly?: boolean;
    initialView?: BlueprintView;
}

/**
 * Edit a mind map independently of tasks, milestones, accounts, or AI sessions.
 * @param props - Host-owned nodes, localized labels and synchronous change callback.
 * @returns A hierarchy editor, or a file view limited to selection and collapse.
 */
export function BlueprintEditor({ nodes, labels, onChange, readOnly = false, initialView = 'list' }: BlueprintEditorProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [edit, setEdit] = useState<{ kind: 'module' | 'feature' | 'rename' | 'notes'; parentId?: string; id?: string } | null>(null);
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [view, setView] = useState<BlueprintView>(initialView);
    const [zoom, setZoom] = useState(1);
    const viewport = useRef<HTMLDivElement>(null);
    const tree = useMemo(() => buildFeatureTree(nodes), [nodes]);
    useEffect(() => {
        const canvas = viewport.current;
        const row = canvas?.querySelector('.feature-tree-row.selected');
        if (!canvas || !row) return;
        const bounds = canvas.getBoundingClientRect();
        const target = row.getBoundingClientRect();
        const offset = (start: number, end: number, min: number, max: number) =>
            start < min ? start - min : end > max ? end - max : 0;
        canvas.scrollBy({
            left: offset(target.left, target.right, bounds.left + 16, bounds.right - 16),
            top: offset(target.top, target.bottom, bounds.top + 16, bounds.bottom - 16),
        });
    }, [selectedId, view, nodes, zoom]);
    const selected = nodes.find(node => node.id === selectedId);
    const parent = selected?.kind === 'module' ? selected.id : selected?.parentId;
    const canAddModule = !parent || validFeatureParents('module', nodes).some(node => node.id === parent);
    const open = (kind: 'module' | 'feature' | 'rename' | 'notes') => {
        setEdit(kind === 'rename' || kind === 'notes' ? { kind, id: selected?.id } : { kind, parentId: parent });
        setTitle(kind === 'rename' ? selected?.title ?? '' : '');
        setNotes(kind === 'rename' || kind === 'notes' ? selected?.notes ?? '' : '');
    };
    const treeView = <BlueprintTree nodes={nodes} tree={tree} selectedId={selectedId} collapsedIds={collapsed}
        presentation={view}
        filtering={false} dragDisabled={readOnly || edit !== null} maxModuleDepth={MAX_FEATURE_MODULE_DEPTH} labels={labels}
        onSelect={setSelectedId}
        onToggleCollapsed={id => setCollapsed(current => {
            const next = new Set(current); if (!next.delete(id)) next.add(id); return next;
        })}
        onMove={async (id, _move, target) => {
            onChange(moveFeatureNode(nodes, id, target));
            if (target.placement === 'inside') setCollapsed(current => new Set([...current].filter(value => value !== target.targetId)));
        }} />;
    return <div class={`blueprint-editor${readOnly ? ' blueprint-readonly' : ''}`}>
        {labels.views && <div class="blueprint-viewbar">
            <div class="blueprint-view-switch" role="group" aria-label={labels.views.label}>
                {(['list', 'mindmap'] as const).map(mode => <button type="button" aria-pressed={view === mode}
                    onClick={() => setView(mode)}>{labels.views![mode]}</button>)}
            </div>
            {view === 'mindmap' && <div class="blueprint-zoom" role="group" aria-label={labels.views.mindmap}>
                <button type="button" aria-label={labels.views.zoomOut} disabled={zoom <= .5}
                    onClick={() => setZoom(current => Math.max(.5, Math.round((current - .1) * 10) / 10))}>−</button>
                <button type="button" aria-label={labels.views.resetZoom} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button type="button" aria-label={labels.views.zoomIn} disabled={zoom >= 1.5}
                    onClick={() => setZoom(current => Math.min(1.5, Math.round((current + .1) * 10) / 10))}>+</button>
            </div>}
        </div>}
        {!readOnly && <div class="blueprint-toolbar">
            <button type="button" disabled={!canAddModule} onClick={() => open('module')}>{labels.addModule}</button>
            <button type="button" disabled={!parent} onClick={() => open('feature')}>{labels.addFeature}</button>
            <button type="button" disabled={!selected} onClick={() => open('rename')}>{labels.rename}</button>
            {labels.notes && <button type="button" disabled={!selected} onClick={() => open('notes')}>{labels.notes.edit}</button>}
            <button type="button" disabled={!selected || featureDescendantIds(selected.id, nodes).size > 0}
                onClick={() => {
                    onChange(nodes.filter(node => node.id !== selectedId));
                    setSelectedId(null); setEdit(null);
                }}>{labels.remove}</button>
            {labels.views && <button type="button" onClick={() => {
                setSelectedId(null); setEdit({ kind: 'module' }); setTitle(''); setNotes('');
            }}>{labels.views.addRoot}</button>}
        </div>}
        {!readOnly && edit && <form class="blueprint-form" onSubmit={event => {
            event.preventDefault();
            const clean = title.trim();
            if (edit.kind !== 'notes' && !clean) return;
            if (edit.kind === 'notes') onChange(nodes.map(node => node.id === edit.id ? { ...node, notes } : node));
            else if (edit.kind === 'rename') onChange(nodes.map(node => node.id === edit.id
                ? { ...node, title: clean, ...(labels.notes ? { notes } : {}) } : node));
            else {
                const id = crypto.randomUUID();
                onChange([...nodes, {
                    id, parentId: edit.parentId, kind: edit.kind, title: clean,
                    position: siblingNodes(nodes, edit.parentId).length, createdAt: new Date().toISOString(),
                    ...(labels.notes && notes ? { notes } : {}),
                }]);
                setSelectedId(id);
                if (edit.parentId) setCollapsed(current => new Set([...current].filter(value => value !== edit.parentId)));
            }
            setEdit(null);
        }}>
            {edit.kind !== 'notes' && <label>{labels.name}<input value={title} required autoFocus
                onInput={event => setTitle(event.currentTarget.value)} /></label>}
            {labels.notes && <label class="blueprint-notes-field">{labels.notes.label}<textarea value={notes} rows={4}
                autoFocus={edit.kind === 'notes'} onInput={event => setNotes(event.currentTarget.value)} /></label>}
            <button type="submit" disabled={edit.kind !== 'notes' && !title.trim()}>{labels.save}</button>
            <button type="button" onClick={() => setEdit(null)}>{labels.cancel}</button>
        </form>}
        {selected && labels.notes && <section class="blueprint-node-notes" aria-label={labels.notes.label}>
            <strong>{selected.title} · {labels.notes.label}</strong>
            <p>{selected.notes || labels.notes.empty}</p>
        </section>}
        {nodes.length === 0 && <p class="blueprint-empty">{labels.empty}</p>}
        {view === 'mindmap' ? <div ref={viewport} class="blueprint-map-viewport" tabIndex={0} role="region" aria-label={labels.views?.mindmap ?? labels.tree}>
            <div class="blueprint-map-canvas" style={{ zoom }}>
                {nodes.length > 0 && <div class="blueprint-map-content">
                    <button type="button" class="blueprint-map-root" onClick={() => { setSelectedId(null); setEdit(null); }}>{labels.tree}</button>
                    <div class="blueprint-map-branches">{treeView}</div>
                </div>}
            </div>
        </div> : treeView}
    </div>;
}
