/** Controlled tree presentation and native drag gestures shared by every embedding. */
import { type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
    featureDropPlacement, resolveFeatureDrop, MAX_FEATURE_MODULE_DEPTH,
    type BlueprintNode, type BlueprintTreeNode, type FeatureDropMove, type FeatureDropTarget,
} from './model.js';

/** Visible and accessible copy supplied by the embedding application's locale. */
export interface BlueprintTreeLabels {
    tree: string;
    rootDrop: string;
    expand: (title: string) => string;
    collapse: (title: string) => string;
}

/** Both presentations use the same hierarchy and mutation gestures. */
export type BlueprintView = 'list' | 'mindmap';

/** Selection, collapse state, persistence and business decorations belong to the embedding. */
export interface BlueprintTreeProps<T extends BlueprintNode> {
    nodes: readonly T[];
    tree: readonly BlueprintTreeNode<T>[];
    selectedId: string | null;
    collapsedIds: ReadonlySet<string>;
    filtering: boolean;
    dragDisabled: boolean;
    maxModuleDepth?: number;
    labels: BlueprintTreeLabels;
    presentation?: BlueprintView;
    onSelect: (id: string) => void;
    onToggleCollapsed: (id: string) => void;
    /** Must settle after saving/refetching; report failures in the owning application. */
    onMove: (id: string, move: FeatureDropMove, target: FeatureDropTarget) => Promise<void>;
    renderProgress?: (node: T) => ComponentChildren;
    renderActions?: (entry: BlueprintTreeNode<T>) => ComponentChildren;
}

/**
 * Render hierarchy, collapse controls and validated before/inside/after/root drops.
 * @param props - Controlled tree and host-owned save callback.
 * @returns The tree and its root drop zone; no requests or application stores.
 */
export function BlueprintTree<T extends BlueprintNode>(props: BlueprintTreeProps<T>) {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<FeatureDropTarget | null>(null);
    const maxDepth = props.maxModuleDepth ?? MAX_FEATURE_MODULE_DEPTH;
    const clear = () => { setDraggedId(null); setDropTarget(null); };
    useEffect(() => { if (props.dragDisabled) clear(); }, [props.dragDisabled]);

    const targetFor = (entry: BlueprintTreeNode<T>, event: DragEvent): FeatureDropTarget => {
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        return {
            targetId: entry.node.id,
            placement: featureDropPlacement(entry.node.kind, bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0.5),
        };
    };
    const over = (target: FeatureDropTarget, event: DragEvent) => {
        event.stopPropagation();
        if (!draggedId || props.dragDisabled || !resolveFeatureDrop(props.nodes, draggedId, target, maxDepth)) {
            setDropTarget(null);
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        setDropTarget(target);
    };
    const drop = (target: FeatureDropTarget, event: DragEvent) => {
        event.stopPropagation();
        if (!draggedId || props.dragDisabled) return;
        const move = resolveFeatureDrop(props.nodes, draggedId, target, maxDepth);
        if (!move) { clear(); return; }
        event.preventDefault();
        const id = draggedId;
        clear();
        // The owner handles failed saves while preserving its last committed nodes.
        void props.onMove(id, move, target);
    };
    const leave = (id: string | undefined, event: DragEvent) => {
        event.stopPropagation();
        const next = event.relatedTarget;
        if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return;
        setDropTarget(current => current?.targetId === id ? null : current);
    };
    const row = (entry: BlueprintTreeNode<T>): ComponentChildren => {
        const collapsed = !props.filtering && props.collapsedIds.has(entry.node.id);
        const placement = dropTarget?.targetId === entry.node.id ? dropTarget.placement : '';
        return <li key={entry.node.id} class={`feature-tree-item${placement ? ` drop-${placement}` : ''}`}>
            <div
                role="button" tabIndex={0} data-blueprint-id={entry.node.id}
                class={`feature-tree-row${props.selectedId === entry.node.id ? ' selected' : ''}${draggedId === entry.node.id ? ' dragging' : ''}`}
                style={`--feature-depth:${Math.max(0, entry.path.length - 1)}`}
                data-kind={entry.node.kind}
                draggable={!props.dragDisabled}
                onClick={() => props.onSelect(entry.node.id)}
                onKeyDown={event => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault(); props.onSelect(entry.node.id);
                }}
                onDragStart={event => {
                    if (props.dragDisabled || (event.target instanceof Element && event.target.closest('button'))) {
                        event.preventDefault(); return;
                    }
                    event.stopPropagation();
                    event.dataTransfer?.setData('text/plain', entry.node.id);
                    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                    setDraggedId(entry.node.id); setDropTarget(null);
                }}
                onDragEnd={clear}
                onDragOver={event => over(targetFor(entry, event), event)}
                onDragLeave={event => leave(entry.node.id, event)}
                onDrop={event => drop(targetFor(entry, event), event)}
            >
                {entry.node.kind === 'feature'
                    ? <span class="feature-tree-toggle placeholder" aria-hidden="true">•</span>
                    : <button type="button" class="feature-tree-toggle"
                        aria-label={collapsed ? props.labels.expand(entry.node.title) : props.labels.collapse(entry.node.title)}
                        aria-expanded={!collapsed} disabled={entry.children.length === 0}
                        onClick={event => { event.stopPropagation(); props.onToggleCollapsed(entry.node.id); }}>
                        {entry.children.length === 0 ? '·' : collapsed ? '▸' : '▾'}
                    </button>}
                <span class="feature-tree-copy">
                    <span class="feature-tree-title">{entry.node.title}</span>
                    {entry.node.notes && <span class="feature-tree-note" title={entry.node.notes}>{entry.node.notes}</span>}
                </span>
                {props.renderProgress?.(entry.node)}
                {props.renderActions && <span class="feature-tree-actions" onClick={event => event.stopPropagation()}>
                    {props.renderActions(entry)}
                </span>}
            </div>
            {entry.children.length > 0 && !collapsed && <ul>{entry.children.map(row)}</ul>}
        </li>;
    };
    return <>
        {props.tree.length > 0 && <ul class={`feature-tree${props.presentation === 'mindmap' ? ' feature-mindmap' : ''}`} aria-label={props.labels.tree}>{props.tree.map(row)}</ul>}
        {props.nodes.length > 0 && <div
            class={`feature-root-drop${dropTarget?.placement === 'root' ? ' active' : ''}${props.dragDisabled ? ' disabled' : ''}`}
            onDragOver={event => over({ placement: 'root' }, event)}
            onDragLeave={event => leave(undefined, event)}
            onDrop={event => drop({ placement: 'root' }, event)}
        >{props.labels.rootDrop}</div>}
    </>;
}
