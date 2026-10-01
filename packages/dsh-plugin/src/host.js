/** File writes use the composed DSH filesystem, including its sandbox and stale guards. */
import { FILE_SERVICE, MAX_FILE_BYTES, documentText, fileContribution, sessionFileOf } from './file-rpc.js';

export const inject = ['fs', 'sandboxPolicy', 'sessions', 'sessionPersistence', 'typert'];

export function apply(ctx) {
    const service = {
        async save(address, expectedText, nodes, signal) {
            try {
                const { sessionId, path } = sessionFileOf(address);
                const live = ctx.sessions.get(sessionId);
                let header = live?.header;
                let policy = live ? ctx.sandboxPolicy.resolve({ session: live }) : ctx.sandboxPolicy.resolve();
                if (!live) {
                    // Reading a historical session does not activate its Agent or append to its log.
                    const handle = await ctx.sessionPersistence.open(sessionId, 'read', { signal });
                    try {
                        header = handle.header;
                        let mode;
                        let offset = 0;
                        while (true) {
                            const { events } = await handle.read(offset, 256, { signal });
                            for (const event of events) if (event.type === 'sandbox/mode') mode = event.data.mode;
                            offset += events.length;
                            if (events.length < 256) break;
                        }
                        if (mode !== undefined) policy = ctx.sandboxPolicy.resolve({ mode });
                    } finally { await handle.close(); }
                }
                const cwd = header?.cwd ?? ctx.sandboxPolicy.workspaceRoot;
                policy = { ...policy, workspaceRoot: cwd, sessionId };
                if (policy.mode === 'read-only') return failure('READ_ONLY', 'This session does not allow file writes');
                const root = await ctx.fs.resolve(cwd, { signal });
                const target = await ctx.fs.resolve(path, { cwd, signal });
                // This editor always edits workspace files, even under a full-access Agent policy.
                if (!ctx.fs.contains(root, target)) return failure('OUTSIDE_WORKSPACE', 'The file is outside the session workspace');
                const info = await ctx.fs.stat(target, signal);
                if (info?.type !== 'file') return failure('NOT_FILE', 'The file no longer exists or is not a regular file');
                const bytes = await ctx.fs.readBytes(target, signal, MAX_FILE_BYTES);
                const currentText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                if (currentText !== expectedText) return failure('REVISION_CONFLICT', 'File changed; reload it before editing');
                const document = documentText(currentText);
                const next = documentText(JSON.stringify({ ...document, nodes }));
                const text = `${JSON.stringify(next, null, 2)}\n`;
                if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) return failure('TOO_LARGE', 'The file exceeds the editing size limit');
                await ctx.fs.writeText(target, text, { kind: 'replaceIfVersion', version: info.version }, signal, policy);
                return { ok: true, text };
            } catch (error) {
                return failure(error?.code === 'FS_STALE_VERSION' ? 'REVISION_CONFLICT' : error?.code ?? 'SAVE_FAILED', error instanceof Error ? error.message : String(error));
            }
        },
    };
    // Explicit binding and strict descriptors are the public Typert contract; no SDK runtime is bundled.
    service.typertRemote = Object.freeze({ service, serviceKey: FILE_SERVICE, namespace: FILE_SERVICE });
    ctx.effect(() => ctx.reflect.provide(FILE_SERVICE, service));
    ctx.effect(() => ctx.typert.register({ ...fileContribution, face: 'host', schemas: [],
        model: { services: [], events: [], objects: [] }, invocations: fileContribution.descriptors }));
}

function failure(code, message) { return { ok: false, error: { code: String(code), message } }; }
