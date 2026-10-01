#!/usr/bin/env node
/** Agent-facing local blueprint commands; stdout is JSON except for help. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildFeatureTree, flattenFeatureTree, moveFeatureNode, featureDescendantIds, siblingNodes } from '../dist/model.js';
import { readDocument, updateDocument } from './file.mjs';
import { startBlueprintServer, launchBrowser } from './open.mjs';

const help = `blueprint <command> <file.blueprint.json> [options]

init                         Create an empty document; never overwrite an existing file.
open [--port <port>] [--no-browser]  Open the file in a local browser editor; Ctrl-C stops it.
show                         Read the complete document and its revision.
list                         Read ordered nodes: id, parentId, kind, title, notes, position, depth.
validate                     Check format, fields, unique ids, parents, cycles and nine module levels.
add --kind module|feature --title <text> [--id <id>] [--parent <module-id>] [--notes <text>]
rename --id <id> --title <text>
notes --id <id> --text <text>  Set multiline remarks; an empty string clears them.
move --id <id> (--inside <module-id> | --before <id> | --after <id> | --root)
remove --id <id> [--subtree]   Delete a leaf; --subtree explicitly deletes its descendants too.
schema                       Print the JSON Schema (no filename).

Mutation commands except init accept --expect-revision <sha256> from show/list/validate.
All file commands return JSON; errors use stderr and exit 1. Ids survive moves/renames.
Features are leaves under modules; only modules can be roots. Unknown options fail.
Writers fail while <file>.lock exists. A killed writer may leave this lock: remove it only
after checking no writer is active. Files change atomically; readers see complete JSON.
`;
const allowed = {
    init: [], show: [], list: [], validate: [], schema: [],
    open: ['port', 'no-browser'],
    add: ['kind', 'title', 'id', 'parent', 'notes', 'expect-revision'],
    rename: ['id', 'title', 'expect-revision'],
    notes: ['id', 'text', 'expect-revision'],
    move: ['id', 'inside', 'before', 'after', 'root', 'expect-revision'],
    remove: ['id', 'subtree', 'expect-revision'],
};
const flags = new Set(['root', 'subtree', 'no-browser']);
function optionsFor(command, args) {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const key = args[i].slice(2);
        if (!args[i].startsWith('--') || !allowed[command].includes(key) || Object.hasOwn(options, key)) throw new Error(`Unexpected or duplicate option: ${args[i]}`);
        if (flags.has(key)) options[key] = true;
        else {
            if (args[i + 1] === undefined || args[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
            options[key] = args[++i];
        }
    }
    return options;
}
function required(options, name) {
    if (typeof options[name] !== 'string' || !options[name].trim()) throw new Error(`--${name} requires a nonempty value`);
    return options[name];
}
function findNode(nodes, id) {
    const node = nodes.find(value => value.id === id);
    if (!node) throw new Error(`Node not found: ${id}`);
    return node;
}
async function main(args) {
    const [command, file, ...rest] = args;
    if (!command || command === 'help' || command === '--help' || command === '-h') { process.stdout.write(help); return; }
    if (!Object.hasOwn(allowed, command)) throw new Error(`Unknown command: ${command}; use blueprint --help`);
    if (command === 'schema') {
        if (file !== undefined) throw new Error('schema takes no filename or options');
        process.stdout.write(await readFile(new URL('../schema/blueprint.schema.json', import.meta.url), 'utf8')); return;
    }
    if (!file || file.startsWith('--')) throw new Error('An explicit blueprint filename is required');
    const options = optionsFor(command, rest);
    if (command === 'open') {
        const port = options.port === undefined ? 0 : Number(options.port);
        if (options.port !== undefined && (!/^\d+$/.test(options.port) || !Number.isInteger(port) || port < 0 || port > 65535)) {
            throw new Error('--port must be an integer between 0 and 65535');
        }
        const opened = await startBlueprintServer(file, { port });
        process.stdout.write(`${JSON.stringify({ ok: true, path: opened.path, url: opened.url })}\n`);
        const stop = () => { opened.server.close(); opened.server.closeAllConnections(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        if (!options['no-browser']) {
            try { await launchBrowser(opened.url); }
            catch { process.stderr.write('Browser could not be opened automatically; open the printed URL.\n'); }
        }
        return;
    }
    if (Object.hasOwn(options, 'expect-revision') && !/^[a-f0-9]{64}$/.test(options['expect-revision'])) throw new Error('--expect-revision requires a SHA-256 hash');
    let result;
    if (['show', 'list', 'validate'].includes(command)) {
        const value = await readDocument(file);
        result = { path: value.path, revision: value.revision };
        if (command === 'show') result.document = value.document;
        else if (command === 'validate') result.nodeCount = value.document.nodes.length;
        else result.nodes = flattenFeatureTree(buildFeatureTree(value.document.nodes)).map(({ node, path }) => ({
            id: node.id, ...(node.parentId ? { parentId: node.parentId } : {}), kind: node.kind, title: node.title,
            ...(node.notes !== undefined ? { notes: node.notes } : {}),
            position: node.position, depth: path.length - 1,
        }));
    } else {
        result = await updateDocument(file, { create: command === 'init', expectedRevision: options['expect-revision'] }, document => {
            const nodes = document.nodes;
            if (command === 'init') return { nodeCount: 0 };
            if (command === 'add') {
                const kind = required(options, 'kind');
                if (!['module', 'feature'].includes(kind)) throw new Error('--kind must be module or feature');
                const title = required(options, 'title').trim();
                const id = Object.hasOwn(options, 'id') ? required(options, 'id') : randomUUID();
                if (nodes.some(node => node.id === id)) throw new Error(`Duplicate node id: ${id}`);
                const parentId = Object.hasOwn(options, 'parent') ? required(options, 'parent') : undefined;
                if (parentId && findNode(nodes, parentId).kind !== 'module') throw new Error('Parent must be a module');
                const siblings = nodes.filter(node => node.parentId === parentId);
                const position = siblings.reduce((max, value) => Math.max(max, value.position), -1) + 1;
                const node = { id, kind, title, position, createdAt: new Date().toISOString(), ...(parentId ? { parentId } : {}),
                    ...(Object.hasOwn(options, 'notes') ? { notes: options.notes } : {}) };
                document.nodes.push(node);
                return { node };
            }
            const id = required(options, 'id');
            const node = findNode(nodes, id);
            if (command === 'notes') {
                if (!Object.hasOwn(options, 'text')) throw new Error('--text is required; use an empty string to clear notes');
                node.notes = options.text; return { node };
            }
            if (command === 'rename') {
                node.title = required(options, 'title').trim(); return { node };
            }
            if (command === 'remove') {
                const descendants = featureDescendantIds(id, nodes);
                if (descendants.size && !options.subtree) throw new Error('Node has children; use --subtree to delete them explicitly');
                const removedIds = [id, ...descendants];
                const removed = new Set(removedIds);
                document.nodes = nodes.filter(value => !removed.has(value.id));
                return { removedIds };
            }
            const placements = ['inside', 'before', 'after', 'root'].filter(key => Object.hasOwn(options, key));
            if (placements.length !== 1) throw new Error('move requires exactly one of --inside, --before, --after or --root');
            const placement = placements[0];
            const targetId = placement === 'root' ? undefined : required(options, placement);
            if (targetId) findNode(nodes, targetId);
            const moved = moveFeatureNode(nodes, id, { placement, targetId });
            if (moved === nodes) {
                const target = nodes.find(value => value.id === targetId);
                const siblings = siblingNodes(nodes, node.parentId);
                const index = siblings.findIndex(value => value.id === id);
                const adjacent = target !== undefined && target.parentId === node.parentId && target.id !== id
                    && siblings[index + (placement === 'before' ? 1 : -1)]?.id === targetId;
                const validNoop = placement === 'root' ? node.kind === 'module' && !node.parentId
                    : placement === 'inside' ? target?.kind === 'module' && node.parentId === targetId : adjacent;
                if (!validNoop) throw new Error('Move violates the blueprint hierarchy');
            }
            document.nodes = [...moved];
            return { node: findNode(document.nodes, id) };
        });
    }
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}
try { await main(process.argv.slice(2)); }
catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code ?? 'INVALID_BLUEPRINT', message: error.message } })}\n`);
    process.exitCode = 1;
}
