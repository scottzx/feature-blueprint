/** Locked, atomic local document writes shared by CLI commands. */
import { createHash, randomUUID } from 'node:crypto';
import { link, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { BLUEPRINT_FORMAT, BLUEPRINT_VERSION, readBlueprintDocument } from '../dist/document.js';

/** SHA-256 of exact file bytes, used for optional optimistic concurrency. */
export function revisionOf(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

/** Read and validate one complete file; malformed files are never repaired implicitly. */
export async function readDocument(file) {
    const path = await realpath(file);
    const bytes = await readFile(path);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path, document: readBlueprintDocument(JSON.parse(text)), revision: revisionOf(bytes) };
}

/**
 * Serialize cooperating writers; reject a stale revision or a busy lock without waiting.
 * New files use an exclusive link; replacements use a same-directory atomic rename.
 * @param file - Explicit local filename; existing symlinks resolve to their target.
 * @param options - Create mode and optional expected content hash.
 * @param change - Synchronous document mutation, returning concise result fields.
 * @returns New revision, path and mutation result after a complete write.
 */
export async function updateDocument(file, { create = false, expectedRevision } = {}, change) {
    const absolute = resolve(file);
    const path = create ? join(await realpath(dirname(absolute)), basename(absolute)) : await realpath(absolute);
    const lockPath = `${path}.lock`;
    const lock = await open(lockPath, 'wx');
    const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    let temporaryExists = false;
    try {
        let previous;
        let mode;
        if (!create) {
            previous = await readDocument(path);
            mode = (await stat(path)).mode & 0o777;
            if (expectedRevision && expectedRevision !== previous.revision) {
                const error = new Error('File changed; read it again before applying this mutation');
                error.code = 'REVISION_CONFLICT'; throw error;
            }
        }
        const document = previous?.document ?? { format: BLUEPRINT_FORMAT, version: BLUEPRINT_VERSION, nodes: [] };
        const result = change(document);
        readBlueprintDocument(document);
        const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
        const handle = await open(temporary, 'wx', mode);
        temporaryExists = true;
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        // Detect non-cooperating changes already visible before replacement.
        if (previous && revisionOf(await readFile(path)) !== previous.revision) {
            const error = new Error('File changed during this mutation');
            error.code = 'REVISION_CONFLICT'; throw error;
        }
        if (create) await link(temporary, path);
        else { await rename(temporary, path); temporaryExists = false; }
        return { path, revision: revisionOf(bytes), ...result };
    } finally {
        try { if (temporaryExists) await unlink(temporary); }
        finally { try { await lock.close(); } finally { await unlink(lockPath); } }
    }
}
