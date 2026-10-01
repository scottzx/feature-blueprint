/** Versioned JSON documents shared by file viewers and the CLI. */
import { MAX_FEATURE_MODULE_DEPTH, type BlueprintNode } from './model.js';

/** Identifies the file independently of its filename. */
export const BLUEPRINT_FORMAT = '1agents.feature-blueprint';
/** Version understood by this reader; unsupported versions fail before editing. */
export const BLUEPRINT_VERSION = 1;

/** A complete local mind map; ids remain stable across renames and moves. */
export interface BlueprintDocument {
    format: typeof BLUEPRINT_FORMAT;
    version: typeof BLUEPRINT_VERSION;
    nodes: BlueprintNode[];
}

function isNode(value: unknown): value is BlueprintNode {
    return typeof value === 'object' && value !== null
        && 'id' in value && typeof value.id === 'string' && value.id.trim().length > 0
        && 'title' in value && typeof value.title === 'string'
        && (!('notes' in value) || value.notes === undefined || typeof value.notes === 'string')
        && 'kind' in value && (value.kind === 'module' || value.kind === 'feature')
        && 'position' in value && Number.isSafeInteger(value.position) && Number(value.position) >= 0
        && 'createdAt' in value && typeof value.createdAt === 'string'
        && (!('parentId' in value) || value.parentId === undefined || (typeof value.parentId === 'string' && value.parentId.trim().length > 0));
}

/**
 * Validate persisted nodes before recursive tree projection.
 * @param value - Node array from storage or JSON.
 * @returns Validated nodes, preserving consumer fields.
 * @throws For invalid fields, duplicate ids, missing parents, cycles or excessive depth.
 */
export function readBlueprintNodes(value: unknown): BlueprintNode[] {
    if (!Array.isArray(value) || !value.every(isNode)) throw new Error('Invalid mind map node fields');
    const nodes: BlueprintNode[] = value;
    const byId = new Map(nodes.map(node => [node.id, node]));
    if (byId.size !== nodes.length) throw new Error('Duplicate mind map node ids');
    for (const node of nodes) {
        if (node.kind === 'feature' && !node.parentId) throw new Error(`Feature ${node.id} requires a module parent`);
        const seen = new Set<string>();
        let current: BlueprintNode | undefined = node;
        let depth = 0;
        while (current) {
            if (seen.has(current.id)) throw new Error('Mind map contains a cycle');
            seen.add(current.id);
            if (current.kind === 'module' && ++depth > MAX_FEATURE_MODULE_DEPTH) throw new Error('Mind map exceeds nine module levels');
            const parent: BlueprintNode | undefined = current.parentId ? byId.get(current.parentId) : undefined;
            if (current.parentId && parent?.kind !== 'module') throw new Error(`Invalid module parent for ${current.id}`);
            current = parent;
        }
    }
    return nodes;
}

/**
 * Validate the file format and its complete node graph.
 * @param value - Parsed JSON; unknown fields are retained by file mutations.
 * @returns The supported document with valid, nonempty node titles and ISO timestamps.
 * @throws For unsupported format/version, invalid fields or invalid hierarchy.
 */
export function readBlueprintDocument(value: unknown): BlueprintDocument {
    if (typeof value !== 'object' || value === null
        || !('format' in value) || value.format !== BLUEPRINT_FORMAT
        || !('version' in value) || value.version !== BLUEPRINT_VERSION
        || !('nodes' in value)) throw new Error('Expected 1agents.feature-blueprint version 1');
    const nodes = readBlueprintNodes(value.nodes);
    for (const node of nodes) {
        if (!node.title.trim()) throw new Error(`Node ${node.id} requires a nonempty title`);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(node.createdAt)
            || !Number.isFinite(Date.parse(node.createdAt))
            || new Date(node.createdAt).toISOString() !== node.createdAt) throw new Error(`Invalid createdAt for ${node.id}`);
    }
    return { ...value, format: BLUEPRINT_FORMAT, version: BLUEPRINT_VERSION, nodes };
}
