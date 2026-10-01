/** Hierarchy and drag placement for module/feature mind maps; no application services. */

/** Modules can contain modules and features; features are leaves. */
export type BlueprintNodeKind = 'module' | 'feature';

/** References are independent of the hierarchy: they never move the linked node. */
export type BlueprintLink =
    | { kind: 'web'; url: string; title?: string }
    | { kind: 'node'; nodeId: string }
    | { kind: 'note'; noteId: string; title: string; url?: string; content?: string };

export interface BlueprintNotebook {
    title: string;
    notes: { id: string; title: string; content?: string; url?: string; section?: string }[];
}

/** Only absolute HTTP(S) URLs are opened by the shared editor. */
export function isBlueprintWebUrl(value: unknown): value is string {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
    try { const url = new URL(value); return !!url.hostname && !url.username && !url.password; }
    catch { return false; }
}

export function isBlueprintLink(value: unknown): value is BlueprintLink {
    if (typeof value !== 'object' || value === null) return false;
    const link = value as Record<string, unknown>;
    const text = (value: unknown) => typeof value === 'string' && !!value.trim();
    if (link.kind === 'node') return text(link.nodeId);
    if (link.kind === 'web') return isBlueprintWebUrl(link.url) && (link.title === undefined || typeof link.title === 'string');
    return link.kind === 'note' && text(link.noteId) && text(link.title)
        && (link.content === undefined || typeof link.content === 'string')
        && (link.url === undefined || isBlueprintWebUrl(link.url));
}

/** Validate host/imported notebooks before creating any directory nodes. */
export function readBlueprintNotebook(value: unknown): BlueprintNotebook {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid notebook');
    const book = value as BlueprintNotebook;
    if (typeof book.title !== 'string' || !book.title.trim() || !Array.isArray(book.notes)) throw new Error('Invalid notebook');
    const ids = new Set<string>();
    for (const note of book.notes) {
        if (!note || typeof note.id !== 'string' || !note.id.trim() || ids.has(note.id)
            || typeof note.title !== 'string' || !note.title.trim()
            || (note.content !== undefined && typeof note.content !== 'string')
            || (note.section !== undefined && typeof note.section !== 'string')
            || (note.url !== undefined && !isBlueprintWebUrl(note.url))) throw new Error('Invalid notebook note');
        ids.add(note.id);
    }
    return book;
}

/** Minimal tree data. Consumers may retain their own fields through generic projections. */
export interface BlueprintNode {
    id: string;
    parentId?: string;
    kind: BlueprintNodeKind;
    title: string;
    /** Optional plain-text, multiline remarks attached to this stable node id. */
    notes?: string;
    links?: BlueprintLink[];
    position: number;
    createdAt: string;
}

/** Append a notebook directory with stable note references and offline content snapshots. */
export function appendNotebookDirectory(
    nodes: readonly BlueprintNode[], notebook: BlueprintNotebook,
    createId: () => string = () => crypto.randomUUID(), createdAt = new Date().toISOString(),
): readonly BlueprintNode[] {
    readBlueprintNotebook(notebook);
    const result: BlueprintNode[] = [...nodes];
    const used = new Set(nodes.map(node => node.id));
    const add = (title: string, kind: BlueprintNodeKind, parentId?: string): BlueprintNode => {
        const id = createId();
        if (!id.trim() || used.has(id)) throw new Error('Duplicate directory node id');
        used.add(id);
        const position = siblingNodes(result, parentId).reduce((max, node) => Math.max(max, node.position), -1) + 1;
        if (!Number.isSafeInteger(position)) throw new Error('Directory position exceeds the supported range');
        const node: BlueprintNode = { id, title, kind, parentId, createdAt, position };
        result.push(node);
        return node;
    };
    const root = add(notebook.title.trim(), 'module');
    const sections = new Map<string, string>();
    for (const note of notebook.notes) {
        const section = note.section?.trim();
        if (section && !sections.has(section)) sections.set(section, add(section, 'module', root.id).id);
        const node = add(note.title.trim(), 'feature', section ? sections.get(section) : root.id);
        node.notes = note.content;
        node.links = [{ kind: 'note', noteId: note.id, title: note.title, ...(note.url ? { url: note.url } : {}),
            ...(note.content !== undefined ? { content: note.content } : {}) }];
    }
    return result;
}

/** Search all text and reference titles while the caller retains matching ancestors. */
export function matchesBlueprintQuery(node: BlueprintNode, query: string, nodes: readonly BlueprintNode[] = []): boolean {
    const text = [node.title, node.notes, ...(node.links ?? []).map(link => link.kind === 'node'
        ? nodes.find(target => target.id === link.nodeId)?.title : `${link.title ?? ''} ${link.url ?? ''} ${link.kind === 'note' ? link.content ?? '' : ''}`)]
        .filter(Boolean).join('\n').toLocaleLowerCase();
    return text.includes(query.trim().toLocaleLowerCase());
}

/** One node with its module depth, complete title path, and ordered children. */
export interface BlueprintTreeNode<T extends BlueprintNode = BlueprintNode> {
    node: T;
    moduleDepth: number;
    path: string[];
    children: BlueprintTreeNode<T>[];
}

/** Default nesting limit inherited from the mind map. */
export const MAX_FEATURE_MODULE_DEPTH = 9;

/** Sibling insertion, child insertion, or append to the top-level module group. */
export type FeatureDropPlacement = 'before' | 'inside' | 'after' | 'root';

/** A root target omits targetId; other placements identify an existing node. */
export interface FeatureDropTarget {
    targetId?: string;
    placement: FeatureDropPlacement;
}

/** Position is an index among destination siblings after excluding the dragged node. */
export interface FeatureDropMove {
    parentId?: string;
    position: number;
}

function compareNodes(a: BlueprintNode, b: BlueprintNode): number {
    return a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Project a complete acyclic catalog without changing its nodes. Missing parents render as roots.
 * @param nodes - Unique node ids and acyclic module parents, supplied by the owner.
 * @returns Roots and descendants ordered by position, creation time, then id; consumer fields are retained.
 */
export function buildFeatureTree<T extends BlueprintNode>(nodes: readonly T[]): BlueprintTreeNode<T>[] {
    const byParent = new Map<string, T[]>();
    const ids = new Set(nodes.map(node => node.id));
    for (const node of nodes) {
        const parentId = node.parentId && ids.has(node.parentId) ? node.parentId : '';
        const siblings = byParent.get(parentId) ?? [];
        siblings.push(node);
        byParent.set(parentId, siblings);
    }
    for (const siblings of byParent.values()) siblings.sort(compareNodes);

    const visit = (node: T, moduleDepth: number, parentPath: string[]): BlueprintTreeNode<T> => {
        const path = [...parentPath, node.title];
        const depth = node.kind === 'module' ? moduleDepth + 1 : moduleDepth;
        return {
            node,
            moduleDepth: depth,
            path,
            children: (byParent.get(node.id) ?? []).map(child => visit(child, depth, path)),
        };
    };

    return (byParent.get('') ?? []).map(node => visit(node, 0, []));
}

/** Flatten a tree in visible ancestor-before-descendant order.
 * @param tree - Projected tree.
 * @returns Entries including descendants regardless of collapse state.
 */
export function flattenFeatureTree<T extends BlueprintNode>(tree: readonly BlueprintTreeNode<T>[]): BlueprintTreeNode<T>[] {
    const result: BlueprintTreeNode<T>[] = [];
    const visit = (entry: BlueprintTreeNode<T>) => {
        result.push(entry);
        entry.children.forEach(visit);
    };
    tree.forEach(visit);
    return result;
}

/** Module ids that must be collapsed to keep the tree visible through the
 * requested level. Level-one modules remain open for "collapse to 2", while
 * level-two modules close over their deeper descendants. */
export function collapsibleFeatureModuleIds<T extends BlueprintNode>(tree: readonly BlueprintTreeNode<T>[], minimumDepth = 1): string[] {
    return flattenFeatureTree(tree)
        .filter(entry => entry.node.kind === 'module' && entry.children.length > 0 && entry.moduleDepth >= minimumDepth)
        .map(entry => entry.node.id);
}

/** Read collapse preferences from browser storage.
 * @param value - Decoded storage value.
 * @returns Unique nonempty string ids, or an empty array for other values.
 */
export function normalizeCollapsedFeatureIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === 'string' && id !== ''))];
}

/** Keep matching nodes together with every ancestor required to preserve the
 * catalog hierarchy. This powers search, status lenses, and version-context
 * jumps without flattening results into a second navigation model. */
export function filterFeatureTree<T extends BlueprintNode>(
    tree: readonly BlueprintTreeNode<T>[],
    matches: (entry: BlueprintTreeNode<T>) => boolean
): BlueprintTreeNode<T>[] {
    return tree.flatMap(entry => {
        const children = filterFeatureTree(entry.children, matches);
        if (!matches(entry) && children.length === 0) return [];
        return [{ ...entry, children }];
    });
}

/** Index projected entries by node id.
 * @param nodes - Complete acyclic catalog.
 * @returns Entries with paths and retained consumer fields.
 */
export function featureEntriesById<T extends BlueprintNode>(nodes: readonly T[]): Map<string, BlueprintTreeNode<T>> {
    return new Map(flattenFeatureTree(buildFeatureTree(nodes)).map(entry => [entry.node.id, entry]));
}

/** Count modules in a node's ancestor chain, including the node when it is a module.
 * @param node - Node whose nesting is needed.
 * @param byId - Complete catalog index.
 * @returns Module depth; missing ancestors end the chain.
 */
export function featureModuleDepth(node: BlueprintNode, byId: Map<string, BlueprintNode>): number {
    let depth = node.kind === 'module' ? 1 : 0;
    let parentId = node.parentId ?? '';
    const seen = new Set<string>([node.id]);
    while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        if (parent.kind === 'module') depth++;
        parentId = parent.parentId ?? '';
    }
    return depth;
}

/** Find every descendant of a node.
 * @param id - Ancestor id.
 * @param nodes - Complete catalog.
 * @returns Descendant ids, excluding the ancestor in an acyclic catalog.
 */
export function featureDescendantIds(id: string, nodes: readonly BlueprintNode[]): Set<string> {
    const descendants = new Set<string>();
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of nodes) {
            if (node.parentId === id || (node.parentId && descendants.has(node.parentId))) {
                if (!descendants.has(node.id)) {
                    descendants.add(node.id);
                    changed = true;
                }
            }
        }
    }
    return descendants;
}

/** Count the deepest module path below a module.
 * @param id - Root module id.
 * @param nodes - Complete acyclic catalog.
 * @returns Height including the root; feature leaves do not count toward module nesting.
 */
export function featureModuleSubtreeHeight(id: string, nodes: readonly BlueprintNode[]): number {
    const children = nodes.filter(node => node.parentId === id && node.kind === 'module');
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map(child => featureModuleSubtreeHeight(child.id, nodes)));
}

/** List modules which can contain a new node or an existing subtree.
 * @param kind - Type being inserted.
 * @param nodes - Complete acyclic catalog.
 * @param editingNode - Existing subtree, when moving a node.
 * @param maxModuleDepth - Maximum module nesting.
 * @returns Candidates in tree order, excluding self, descendants and overly deep placements.
 */
export function validFeatureParents<T extends BlueprintNode>(
    kind: BlueprintNodeKind,
    nodes: readonly T[],
    editingNode?: T,
    maxModuleDepth = MAX_FEATURE_MODULE_DEPTH
): T[] {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const orderedNodes = flattenFeatureTree(buildFeatureTree(nodes)).map(entry => entry.node);
    const excluded = editingNode ? featureDescendantIds(editingNode.id, nodes) : new Set<string>();
    if (editingNode) excluded.add(editingNode.id);
    const subtreeHeight = editingNode?.kind === 'module' ? featureModuleSubtreeHeight(editingNode.id, nodes) : 1;

    return orderedNodes.filter(node => {
        if (node.kind !== 'module' || excluded.has(node.id)) return false;
        if (kind === 'feature') return true;
        return featureModuleDepth(node, byId) + subtreeHeight <= maxModuleDepth;
    });
}

/** Read a sibling group in its deterministic order.
 * @param nodes - Complete catalog.
 * @param parentId - Parent id; absent or empty means top level.
 * @returns A new sorted array referencing the original nodes.
 */
export function siblingNodes<T extends BlueprintNode>(nodes: readonly T[], parentId?: string): T[] {
    return nodes.filter(node => (node.parentId ?? '') === (parentId ?? '')).sort(compareNodes);
}

/** Resolve a gesture without altering the catalog.
 * @param nodes - Complete acyclic catalog, including hidden nodes.
 * @param draggedId - Existing node id.
 * @param target - Requested insertion placement.
 * @param maxModuleDepth - Maximum module nesting.
 * @returns Destination parent and position, or null for invalid and unchanged moves.
 */
export function resolveFeatureDrop(
    nodes: readonly BlueprintNode[],
    draggedId: string,
    target: FeatureDropTarget,
    maxModuleDepth = MAX_FEATURE_MODULE_DEPTH
): FeatureDropMove | null {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const dragged = byId.get(draggedId);
    if (!dragged) return null;

    let parentId = '';
    let position = 0;
    if (target.placement === 'root') {
        if (target.targetId || dragged.kind !== 'module') return null;
        const roots = siblingNodes(nodes, '').filter(node => node.id !== dragged.id);
        position = roots.length;
    } else {
        const targetNode = target.targetId ? byId.get(target.targetId) : undefined;
        if (!targetNode || targetNode.id === dragged.id) return null;
        if (target.placement === 'inside') {
            if (targetNode.kind !== 'module') return null;
            parentId = targetNode.id;
            position = siblingNodes(nodes, parentId).filter(node => node.id !== dragged.id).length;
        } else {
            parentId = targetNode.parentId ?? '';
            if (!parentId && dragged.kind === 'feature') return null;
            const siblings = siblingNodes(nodes, parentId).filter(node => node.id !== dragged.id);
            const targetIndex = siblings.findIndex(node => node.id === targetNode.id);
            if (targetIndex < 0) return null;
            position = targetIndex + (target.placement === 'after' ? 1 : 0);
        }
    }

    if (dragged.kind === 'feature' && !parentId) return null;
    if (dragged.kind === 'module') {
        const descendants = featureDescendantIds(dragged.id, nodes);
        if (parentId === dragged.id || descendants.has(parentId)) return null;
        const parentDepth = parentId ? featureModuleDepth(byId.get(parentId)!, byId) : 0;
        if (parentId && byId.get(parentId)?.kind !== 'module') return null;
        if (parentDepth + featureModuleSubtreeHeight(dragged.id, nodes) > maxModuleDepth) {
            return null;
        }
    } else if (byId.get(parentId)?.kind !== 'module') {
        return null;
    }

    const currentParent = dragged.parentId ?? '';
    const currentSiblings = siblingNodes(nodes, currentParent);
    const currentPosition = currentSiblings.findIndex(node => node.id === dragged.id);
    if (currentParent === parentId && currentPosition === position) return null;
    return { parentId: parentId || undefined, position };
}

/** Classify a pointer within a row using the original quarter/half drop regions.
 * @param kind - Features offer sibling insertion only.
 * @param ratio - Vertical offset divided by row height.
 * @returns The highlighted placement.
 */
export function featureDropPlacement(kind: BlueprintNodeKind, ratio: number): FeatureDropPlacement {
    if (kind === 'feature') return ratio < 0.5 ? 'before' : 'after';
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
}

/** Apply an accepted move to a new array and renumber affected sibling groups.
 * @param nodes - Current complete tree.
 * @param draggedId - Node being moved.
 * @param target - Requested placement.
 * @param maxModuleDepth - Maximum module nesting.
 * @returns New nodes, or the original array when the move is invalid or unchanged.
 */
export function moveFeatureNode<T extends BlueprintNode>(
    nodes: readonly T[], draggedId: string, target: FeatureDropTarget,
    maxModuleDepth = MAX_FEATURE_MODULE_DEPTH,
): readonly T[] {
    const move = resolveFeatureDrop(nodes, draggedId, target, maxModuleDepth);
    if (!move) return nodes;
    const dragged = nodes.find(node => node.id === draggedId)!;
    const destination = siblingNodes(nodes, move.parentId).filter(node => node.id !== draggedId);
    destination.splice(move.position, 0, { ...dragged, parentId: move.parentId });
    const changed = new Map(destination.map((node, position) => [node.id, { ...node, position }]));
    if ((dragged.parentId ?? '') !== (move.parentId ?? '')) {
        siblingNodes(nodes, dragged.parentId).filter(node => node.id !== draggedId)
            .forEach((node, position) => changed.set(node.id, { ...node, position }));
    }
    return nodes.map(node => changed.get(node.id) ?? node);
}
