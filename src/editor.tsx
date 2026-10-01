/** A small mind map editor for embeddings without project-management services. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
    buildFeatureTree, moveFeatureNode, siblingNodes, featureDescendantIds,
    validFeatureParents, MAX_FEATURE_MODULE_DEPTH, filterFeatureTree, flattenFeatureTree,
    collapsibleFeatureModuleIds, matchesBlueprintQuery, isBlueprintWebUrl,
    readBlueprintNotebook, appendNotebookDirectory, type BlueprintNode, type BlueprintLink, type BlueprintNotebook,
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
    tools?: {
        search: string; clearSearch: string; results: (count: number) => string; noResults: string;
        expandAll: string; collapseAll: string; collapseToLevel: string; shortcuts: string;
        links: string; webLink: string; nodeLink: string; noteLink: string; url: string; linkTitle: string;
        addLink: string; removeLink: string; missingLink: string; invalidUrl: string;
        notebook: string; notebookHelp: string; invalidNotebook: string; noteSnapshot: string;
    };
    /** Supply localized view controls to enable switching in existing embeddings. */
    views?: {
        label: string;
        list: string;
        mindmap: string;
        zoomIn: string;
        zoomOut: string;
        resetZoom: string;
        fitCanvas?: string;
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
    /** Starting canvas scale; constrained to the existing 50%–150% range. */
    initialZoom?: number;
    /** Canvas with floating, contextual tools for narrow sidebar embeddings. */
    canvasOnly?: boolean;
    /** Optional notebook service supplied by the embedding; JSON import works without one. */
    notebook?: BlueprintNotebook;
    onOpenNote?: (noteId: string) => void;
}

/**
 * Edit a mind map independently of tasks, milestones, accounts, or AI sessions.
 * @param props - Host-owned nodes, localized labels and synchronous change callback.
 * @returns A hierarchy editor, or a file view limited to selection and collapse.
 */
export function BlueprintEditor({ nodes, labels, onChange, readOnly = false, initialView = 'list', initialZoom = 1, canvasOnly = false, notebook, onOpenNote }: BlueprintEditorProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [edit, setEdit] = useState<{ kind: 'module' | 'feature' | 'rename' | 'notes'; parentId?: string; id?: string; afterId?: string } | null>(null);
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [view, setView] = useState<BlueprintView>(canvasOnly ? 'mindmap' : initialView);
    const [showDetails, setShowDetails] = useState(false);
    const [zoom, setZoom] = useState(Number.isFinite(initialZoom) ? Math.min(1.5, Math.max(.5, initialZoom)) : 1);
    const [query, setQuery] = useState('');
    const [linkKind, setLinkKind] = useState<BlueprintLink['kind']>('web');
    const [linkValue, setLinkValue] = useState('');
    const [linkTitle, setLinkTitle] = useState('');
    const [linkError, setLinkError] = useState('');
    const [importedNotebook, setImportedNotebook] = useState<BlueprintNotebook>();
    const [notebookError, setNotebookError] = useState('');
    const notebookInput = useRef<HTMLInputElement>(null);
    const titleInput = useRef<HTMLInputElement>(null);
    const notesInput = useRef<HTMLTextAreaElement>(null);
    const editorRoot = useRef<HTMLDivElement>(null);
    const currentHost = useRef({ nodes, onChange, readOnly });
    currentHost.current = { nodes, onChange, readOnly };
    const previousNodes = useRef(nodes);
    const viewport = useRef<HTMLDivElement>(null);
    const fittedCanvas = useRef(false);
    const renderedZoom = useRef(zoom);
    const wheelZoom = useRef(zoom);
    const zoomAnchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
    const canvasOffset = useRef({ x: 0, y: 0 });
    const tree = useMemo(() => buildFeatureTree(nodes), [nodes]);
    const filtering = !!query.trim();
    const visibleTree = useMemo(() => filtering ? filterFeatureTree(tree, entry => matchesBlueprintQuery(entry.node, query, nodes)) : tree, [tree, query, nodes]);
    const matches = nodes.filter(node => matchesBlueprintQuery(node, query, nodes)).length;
    const activeNotebook = notebook ?? importedNotebook;
    const fitCanvas = () => {
        const canvas = viewport.current;
        const content = canvas?.querySelector<HTMLElement>('.blueprint-map-content');
        if (!canvas?.clientWidth || !content?.offsetWidth) return false;
        const scale = Math.min((canvas.clientWidth - 24) / (content.offsetWidth + 48), (canvas.clientHeight - 24) / (content.offsetHeight + 154));
        canvasOffset.current = { x: 0, y: 0 };
        const map = canvas.querySelector<HTMLElement>('.blueprint-map-canvas');
        map?.style.removeProperty('--blueprint-pan-x');
        map?.style.removeProperty('--blueprint-pan-y');
        zoomAnchor.current = null;
        setZoom(Math.max(.5, Math.min(1, Math.floor(scale * 100) / 100)));
        canvas.scrollTo({ left: 0, top: 0 });
        return true;
    };
    useLayoutEffect(() => {
        if (canvasOnly && !fittedCanvas.current && nodes.length) fittedCanvas.current = fitCanvas();
    }, [canvasOnly, nodes, view]);
    useLayoutEffect(() => {
        const canvas = viewport.current;
        const map = canvas?.querySelector<HTMLElement>('.blueprint-map-canvas');
        const content = map?.querySelector<HTMLElement>('.blueprint-map-content') ?? map;
        const anchor = zoomAnchor.current;
        if (canvas && map && content && anchor) {
            // Scroll first, then offset any remainder at the scroll boundaries.
            // This also anchors a small diagram that does not fill its viewport.
            for (let pass = 0; pass < 2; pass++) {
                const bounds = content.getBoundingClientRect();
                canvas.scrollBy({ left: bounds.left + anchor.x * zoom - anchor.clientX, top: bounds.top + anchor.y * zoom - anchor.clientY });
                const scrolled = content.getBoundingClientRect();
                canvasOffset.current.x += (anchor.clientX - scrolled.left - anchor.x * zoom) / zoom;
                canvasOffset.current.y += (anchor.clientY - scrolled.top - anchor.y * zoom) / zoom;
                map.style.setProperty('--blueprint-pan-x', `${canvasOffset.current.x}px`);
                map.style.setProperty('--blueprint-pan-y', `${canvasOffset.current.y}px`);
            }
        }
        zoomAnchor.current = null;
        renderedZoom.current = wheelZoom.current = zoom;
    }, [zoom, view]);
    useLayoutEffect(() => {
        const canvas = viewport.current;
        if (!canvas || view !== 'mindmap') {
            canvasOffset.current = { x: 0, y: 0 };
            zoomAnchor.current = null;
            return;
        }
        const onWheel = (event: WheelEvent) => {
            // Shift-wheel retains horizontal navigation. Pinch gestures arrive as Ctrl-wheel.
            if (!event.deltaY || event.shiftKey || !event.cancelable) return;
            event.preventDefault();
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
            const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
            const nextZoom = Math.max(.5, Math.min(1.5, wheelZoom.current * Math.exp(-delta * .002)));
            if (nextZoom === wheelZoom.current) return;
            const map = canvas.querySelector<HTMLElement>('.blueprint-map-canvas');
            if (!map) return;
            const bounds = (map.querySelector<HTMLElement>('.blueprint-map-content') ?? map).getBoundingClientRect();
            zoomAnchor.current = {
                x: (event.clientX - bounds.left) / renderedZoom.current,
                y: (event.clientY - bounds.top) / renderedZoom.current,
                clientX: event.clientX, clientY: event.clientY,
            };
            wheelZoom.current = nextZoom;
            setZoom(nextZoom);
        };
        // Explicitly non-passive so the host page does not scroll or zoom with the map.
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, [view]);
    useLayoutEffect(() => {
        if (!edit || readOnly) return;
        if (edit.kind === 'notes') notesInput.current?.focus();
        else {
            titleInput.current?.focus();
            if (edit.kind === 'rename') titleInput.current?.select();
        }
    }, [edit, readOnly]);
    const focusNode = (id: string) => {
        requestAnimationFrame(() => editorRoot.current?.querySelector<HTMLElement>(`[data-blueprint-id="${CSS.escape(id)}"]`)?.focus());
    };
    const revealNode = (id: string) => {
        const entry = flattenFeatureTree(tree).find(entry => entry.node.id === id);
        if (!entry) return;
        const ancestors = new Set<string>();
        let current = entry.node;
        while (current.parentId) {
            ancestors.add(current.parentId);
            const parent = nodes.find(node => node.id === current.parentId);
            if (!parent) break;
            current = parent;
        }
        setQuery(''); setCollapsed(current => new Set([...current].filter(id => !ancestors.has(id))));
        setSelectedId(id); focusNode(id);
    };
    useEffect(() => {
        // A new node may be selected before an asynchronous host has committed it.
        // Clear selection only when a previously committed node was actually removed.
        if (selectedId && previousNodes.current.some(node => node.id === selectedId) && !nodes.some(node => node.id === selectedId)) {
            setSelectedId(null); setEdit(null);
        }
        if (selectedId && !previousNodes.current.some(node => node.id === selectedId) && nodes.some(node => node.id === selectedId)) focusNode(selectedId);
        previousNodes.current = nodes;
    }, [nodes, selectedId]);
    useEffect(() => {
        setLinkValue(''); setLinkTitle(''); setLinkError('');
        setShowDetails(false);
    }, [selectedId]);
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
    }, [selectedId, view, nodes]);
    const selected = nodes.find(node => node.id === selectedId);
    const parent = selected?.kind === 'module' ? selected.id : selected?.parentId;
    const canAddModule = !parent || validFeatureParents('module', nodes).some(node => node.id === parent);
    const open = (kind: 'module' | 'feature' | 'rename' | 'notes') => {
        setEdit(kind === 'rename' || kind === 'notes' ? { kind, id: selected?.id } : { kind, parentId: parent });
        setTitle(kind === 'rename' ? selected?.title ?? '' : '');
        setNotes(kind === 'rename' || kind === 'notes' ? selected?.notes ?? '' : '');
    };
    const treeView = <BlueprintTree nodes={nodes} tree={visibleTree} selectedId={selectedId} collapsedIds={collapsed}
        presentation={view}
        filtering={filtering} dragDisabled={readOnly || edit !== null || filtering} maxModuleDepth={MAX_FEATURE_MODULE_DEPTH} labels={labels}
        onSelect={setSelectedId}
        onEdit={readOnly ? undefined : id => {
            const node = nodes.find(node => node.id === id)!;
            setSelectedId(id); setEdit({ kind: 'rename', id }); setTitle(node.title); setNotes(node.notes ?? '');
        }}
        onToggleCollapsed={id => setCollapsed(current => {
            const next = new Set(current); if (!next.delete(id)) next.add(id); return next;
        })}
        onMove={async (id, _move, target) => {
            onChange(moveFeatureNode(nodes, id, target));
            if (target.placement === 'inside') setCollapsed(current => new Set([...current].filter(value => value !== target.targetId)));
        }} />;
    return <div ref={editorRoot} class={`blueprint-editor${readOnly ? ' blueprint-readonly' : ''}${canvasOnly ? ' blueprint-canvas-only' : ''}${showDetails ? ' blueprint-show-details' : ''}${selected ? ' blueprint-has-selection' : ''}`} onKeyDown={event => {
        if (event.key === 'Escape') { setEdit(null); if (selectedId) focusNode(selectedId); return; }
        if (!(event.target instanceof HTMLElement) || !event.target.matches('.feature-tree-row') || !selected) return;
        const visible = flattenFeatureTree(visibleTree).filter(entry => {
            let parentId = entry.node.parentId;
            while (parentId && !filtering) {
                if (collapsed.has(parentId)) return false;
                parentId = nodes.find(node => node.id === parentId)?.parentId;
            }
            return true;
        });
        const index = visible.findIndex(entry => entry.node.id === selected.id);
        const select = (id?: string) => { if (id) { setSelectedId(id); focusNode(id); } };
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); select(visible[index + (event.key === 'ArrowDown' ? 1 : -1)]?.node.id);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (!filtering && !collapsed.has(selected.id) && nodes.some(node => node.parentId === selected.id)) setCollapsed(new Set([...collapsed, selected.id]));
            else select(selected.parentId);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (!filtering && collapsed.has(selected.id)) setCollapsed(new Set([...collapsed].filter(id => id !== selected.id)));
            else select(siblingNodes(nodes, selected.id)[0]?.id);
        } else if (!readOnly && !filtering && event.key === 'Enter') {
            event.preventDefault();
            setEdit({ kind: selected.kind, parentId: selected.parentId, afterId: selected.id }); setTitle(''); setNotes('');
        } else if (!readOnly && !filtering && event.key === 'Tab' && !event.shiftKey && selected.kind === 'module' && canAddModule) {
            event.preventDefault(); open('module');
        } else if (!readOnly && event.key === 'F2') { event.preventDefault(); open('rename'); }
    }}>
        {labels.views && <div class="blueprint-viewbar">
            {!canvasOnly && <div class="blueprint-view-switch" role="group" aria-label={labels.views.label}>
                {(['list', 'mindmap'] as const).map(mode => <button type="button" aria-pressed={view === mode}
                    onClick={() => setView(mode)}>{labels.views![mode]}</button>)}
            </div>}
            {view === 'mindmap' && <div class="blueprint-zoom" role="group" aria-label={labels.views.mindmap}>
                <button type="button" aria-label={labels.views.zoomOut} disabled={zoom <= .5}
                    onClick={() => setZoom(current => Math.max(.5, Math.round((current - .1) * 10) / 10))}>−</button>
                <button type="button" aria-label={canvasOnly ? labels.views.fitCanvas ?? labels.views.resetZoom : labels.views.resetZoom}
                    onClick={() => canvasOnly ? fitCanvas() : setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button type="button" aria-label={labels.views.zoomIn} disabled={zoom >= 1.5}
                    onClick={() => setZoom(current => Math.min(1.5, Math.round((current + .1) * 10) / 10))}>+</button>
            </div>}
        </div>}
        {labels.tools && !canvasOnly && <div class="blueprint-organize">
            <div class="blueprint-search"><input type="search" aria-label={labels.tools.search} placeholder={labels.tools.search}
                value={query} onInput={event => setQuery(event.currentTarget.value)} />
                {filtering && <button type="button" onClick={() => setQuery('')}>{labels.tools.clearSearch}</button>}
                <span role="status">{filtering ? labels.tools.results(matches) : ''}</span>
            </div>
            <div class="blueprint-collapse-controls">
                <button type="button" disabled={filtering} onClick={() => setCollapsed(new Set())}>{labels.tools.expandAll}</button>
                <button type="button" disabled={filtering} onClick={() => setCollapsed(new Set(collapsibleFeatureModuleIds(tree)))}>{labels.tools.collapseAll}</button>
                <select aria-label={labels.tools.collapseToLevel} disabled={filtering} value="" onChange={event => {
                    if (event.currentTarget.value) setCollapsed(new Set(collapsibleFeatureModuleIds(tree, Number(event.currentTarget.value))));
                }}><option value="" disabled>{labels.tools.collapseToLevel}</option>
                    {Array.from({ length: MAX_FEATURE_MODULE_DEPTH }, (_, i) => <option value={i + 1}>{i + 1}</option>)}
                </select>
            </div>
        </div>}
        {!readOnly && <div class="blueprint-toolbar">
            <button type="button" data-blueprint-action="add-module" title={labels.addModule} aria-label={labels.addModule} disabled={!canAddModule} onClick={() => open('module')}>{labels.addModule}</button>
            <button type="button" data-blueprint-action="add-feature" title={labels.addFeature} aria-label={labels.addFeature} disabled={!parent} onClick={() => open('feature')}>{labels.addFeature}</button>
            <button type="button" data-blueprint-action="rename" title={labels.rename} aria-label={labels.rename} disabled={!selected} onClick={() => open('rename')}>{labels.rename}</button>
            {labels.notes && <button type="button" data-blueprint-action="notes" title={labels.notes.edit} aria-label={labels.notes.edit} disabled={!selected} onClick={() => open('notes')}>{labels.notes.edit}</button>}
            {canvasOnly && selected && labels.tools && <button type="button" data-blueprint-action="details" title={labels.tools.links} aria-label={labels.tools.links} aria-expanded={showDetails} onClick={() => setShowDetails(current => !current)}>↗</button>}
            <button type="button" data-blueprint-action="remove" title={labels.remove} aria-label={labels.remove} disabled={!selected || featureDescendantIds(selected.id, nodes).size > 0}
                onClick={() => {
                    onChange(nodes.filter(node => node.id !== selectedId));
                    setSelectedId(null); setEdit(null);
                }}>{labels.remove}</button>
            {labels.views && <button type="button" data-blueprint-action="add-root" title={labels.views.addRoot} aria-label={labels.views.addRoot} onClick={() => {
                setSelectedId(null); setEdit({ kind: 'module' }); setTitle(''); setNotes('');
            }}>{canvasOnly ? '+' : labels.views.addRoot}</button>}
            {labels.tools && !canvasOnly && <button type="button" data-blueprint-action="notebook" title={labels.tools.notebookHelp} onClick={() => {
                if (!activeNotebook) { notebookInput.current?.click(); return; }
                try { onChange(appendNotebookDirectory(nodes, activeNotebook)); setNotebookError(''); setQuery(''); }
                catch { setNotebookError(labels.tools!.invalidNotebook); }
            }}>{labels.tools.notebook}</button>}
        </div>}
        {!readOnly && labels.tools && !canvasOnly && <>
            <input ref={notebookInput} class="blueprint-file-input" type="file" accept=".json,application/json" aria-label={labels.tools.notebook} onChange={async event => {
                const input = event.currentTarget;
                const file = input.files?.[0]; input.value = '';
                if (!file) return;
                try {
                    const book = readBlueprintNotebook(JSON.parse(await file.text()));
                    // Read the latest host-owned nodes when an asynchronous file read finishes.
                    const host = currentHost.current;
                    if (host.readOnly) return;
                    host.onChange(appendNotebookDirectory(host.nodes, book));
                    setImportedNotebook(book); setNotebookError('');
                    setQuery('');
                } catch { setNotebookError(labels.tools!.invalidNotebook); }
            }} />
            {activeNotebook && <p class="blueprint-notebook-info">{activeNotebook.title} · {activeNotebook.notes.length}</p>}
            {notebookError && <p role="alert">{notebookError}</p>}
            <p class="blueprint-shortcuts">{labels.tools.shortcuts}</p>
        </>}
        {!readOnly && edit && <form class="blueprint-form" onSubmit={event => {
            event.preventDefault();
            const clean = title.trim();
            if (edit.kind !== 'notes' && !clean) return;
            if (edit.kind === 'notes') onChange(nodes.map(node => node.id === edit.id ? { ...node, notes } : node));
            else if (edit.kind === 'rename') onChange(nodes.map(node => node.id === edit.id
                ? { ...node, title: clean, ...(labels.notes ? { notes } : {}) } : node));
            else {
                if (edit.parentId && !validFeatureParents(edit.kind, nodes).some(node => node.id === edit.parentId)) return;
                if (edit.kind === 'feature' && !edit.parentId) return;
                const id = crypto.randomUUID();
                let next: readonly BlueprintNode[] = [...nodes, {
                    id, parentId: edit.parentId, kind: edit.kind, title: clean,
                    position: siblingNodes(nodes, edit.parentId).length, createdAt: new Date().toISOString(),
                    ...(labels.notes && notes ? { notes } : {}),
                }];
                if (edit.afterId) next = moveFeatureNode(next, id, { placement: 'after', targetId: edit.afterId });
                onChange(next);
                setQuery(''); focusNode(id);
                setSelectedId(id);
                if (edit.parentId) setCollapsed(current => new Set([...current].filter(value => value !== edit.parentId)));
            }
            if (edit.id) focusNode(edit.id);
            setEdit(null);
        }}>
            {edit.kind !== 'notes' && <label>{labels.name}<input ref={titleInput} value={title} required
                onInput={event => setTitle(event.currentTarget.value)} /></label>}
            {labels.notes && <label class="blueprint-notes-field">{labels.notes.label}<textarea ref={notesInput} value={notes} rows={4}
                onInput={event => setNotes(event.currentTarget.value)} /></label>}
            <button type="submit" disabled={edit.kind !== 'notes' && !title.trim()}>{labels.save}</button>
            <button type="button" onClick={() => setEdit(null)}>{labels.cancel}</button>
        </form>}
        {selected && (labels.notes || labels.tools) && <div class="blueprint-inspector">
        {labels.notes && <section class="blueprint-node-notes" aria-label={labels.notes.label}>
            <strong>{selected.title} · {labels.notes.label}</strong>
            <p>{selected.notes || labels.notes.empty}</p>
        </section>}
        {labels.tools && <section class="blueprint-node-links" aria-label={labels.tools.links}>
            <strong>{selected.title} · {labels.tools.links}</strong>
            <ul>{(selected.links ?? []).map((link, index) => <li>
                {link.kind === 'node' ? <button type="button" disabled={!nodes.some(node => node.id === link.nodeId)}
                    onClick={() => revealNode(link.nodeId)}>{nodes.find(node => node.id === link.nodeId)?.title ?? labels.tools!.missingLink}</button>
                    : link.kind === 'web' ? <a href={link.url} target="_blank" rel="noopener noreferrer">{link.title || link.url} ↗</a>
                    : onOpenNote ? <button type="button" onClick={() => onOpenNote(link.noteId)}>{link.title} ↗</button>
                    : link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer">{link.title} ↗</a>
                    : <details><summary>{link.title} · {labels.tools!.noteSnapshot}</summary><p>{link.content ?? activeNotebook?.notes.find(note => note.id === link.noteId)?.content ?? labels.notes?.empty}</p></details>}
                {!readOnly && <button type="button" aria-label={`${labels.tools!.removeLink} ${index + 1}`} onClick={() => onChange(nodes.map(node => node.id === selected.id
                    ? { ...node, links: node.links?.filter((_, i) => i !== index) } : node))}>×</button>}
            </li>)}</ul>
            {nodes.filter(node => node.links?.some(link => link.kind === 'node' && link.nodeId === selected.id)).map(node =>
                <button type="button" class="blueprint-backlink" onClick={() => revealNode(node.id)}>← {node.title}</button>)}
            {!readOnly && <form class="blueprint-link-form" onSubmit={event => {
                event.preventDefault(); setLinkError('');
                let link: BlueprintLink;
                if (linkKind === 'web') {
                    if (!isBlueprintWebUrl(linkValue.trim())) { setLinkError(labels.tools!.invalidUrl); return; }
                    link = { kind: 'web', url: linkValue.trim(), ...(linkTitle.trim() ? { title: linkTitle.trim() } : {}) };
                } else if (linkKind === 'node') {
                    if (linkValue === selected.id || !nodes.some(node => node.id === linkValue)) return;
                    link = { kind: 'node', nodeId: linkValue };
                } else {
                    const note = activeNotebook?.notes.find(note => note.id === linkValue);
                    if (!note) return;
                    link = { kind: 'note', noteId: note.id, title: note.title, ...(note.url ? { url: note.url } : {}),
                        ...(note.content !== undefined ? { content: note.content } : {}) };
                }
                const existing = selected.links ?? [];
                const duplicate = existing.some(value => value.kind === link.kind && (value.kind === 'web' && link.kind === 'web' ? value.url === link.url
                    : value.kind === 'node' && link.kind === 'node' ? value.nodeId === link.nodeId
                    : value.kind === 'note' && link.kind === 'note' && value.noteId === link.noteId));
                if (!duplicate) onChange(nodes.map(node => node.id === selected.id ? { ...node, links: [...existing, link] } : node));
                setLinkValue(''); setLinkTitle('');
            }}>
                <select aria-label={labels.tools.links} value={linkKind} onChange={event => {
                    setLinkKind(event.currentTarget.value as BlueprintLink['kind']); setLinkValue(''); setLinkError('');
                }}><option value="web">{labels.tools.webLink}</option><option value="node">{labels.tools.nodeLink}</option>
                    {activeNotebook && <option value="note">{labels.tools.noteLink}</option>}
                </select>
                {linkKind === 'web' ? <>
                    <input type="url" required placeholder="https://" aria-label={labels.tools.url} value={linkValue} onInput={event => setLinkValue(event.currentTarget.value)} />
                    <input placeholder={labels.tools.linkTitle} aria-label={labels.tools.linkTitle} value={linkTitle} onInput={event => setLinkTitle(event.currentTarget.value)} />
                </> : <select aria-label={linkKind === 'node' ? labels.tools.nodeLink : labels.tools.noteLink} value={linkValue} required onChange={event => setLinkValue(event.currentTarget.value)}>
                    <option value="" disabled>{linkKind === 'node' ? labels.tools.nodeLink : labels.tools.noteLink}</option>
                    {linkKind === 'node' ? flattenFeatureTree(tree).filter(entry => entry.node.id !== selected.id).map(entry => <option value={entry.node.id}>{entry.path.join(' / ')}</option>)
                        : activeNotebook?.notes.map(note => <option value={note.id}>{note.title}</option>)}
                </select>}
                <button type="submit" disabled={!linkValue.trim()}>{labels.tools.addLink}</button>
            </form>}
            {linkError && <p role="alert">{linkError}</p>}
        </section>}
        </div>}
        {nodes.length === 0 && <p class="blueprint-empty">{labels.empty}</p>}
        {filtering && matches === 0 && labels.tools && <p class="blueprint-empty" role="status">{labels.tools.noResults}</p>}
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
