/** Shared, strictly validated Host/Client contract for editing one addressed file. */
import { readBlueprintDocument, type BlueprintDocument } from '../../../dist/document.js';
import type { BlueprintNode } from '../../../dist/model.js';

export const FILE_SERVICE = 'oneagentsBlueprintFiles';
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export type SaveResult = { ok: true; text: string } | { ok: false; error: { code: string; message: string } };
export type SaveFile = (address: string, expectedText: string, nodes: readonly BlueprintNode[], signal: AbortSignal) => Promise<SaveResult>;

export function sessionFileOf(address: string): { sessionId: string; path: string } {
    const prefix = 'dsh-resource://file/session/';
    if (!address.startsWith(prefix)) throw new Error('Expected a session file address');
    const end = address.search(/[?#]/);
    const [id, ...segments] = address.slice(prefix.length, end < 0 ? undefined : end).split('/');
    const sessionId = decodeURIComponent(id);
    const path = segments.map(decodeURIComponent).join('/');
    if (!sessionId || !path || path.includes('\0') || !path.toLowerCase().endsWith('.blueprint.json')) {
        throw new Error('Expected a .blueprint.json session file');
    }
    return { sessionId, path };
}

function stringOf(value: unknown): string {
    if (typeof value !== 'string' || new TextEncoder().encode(value).length > MAX_FILE_BYTES) throw new Error('Invalid or oversized file text');
    return value;
}
function nodesOf(value: unknown): BlueprintNode[] {
    return readBlueprintDocument({ format: '1agents.feature-blueprint', version: 1, nodes: value }).nodes;
}
export function documentText(text: string): BlueprintDocument {
    return readBlueprintDocument(JSON.parse(stringOf(text)));
}
function resultOf(value: unknown): SaveResult {
    const result = value as SaveResult;
    if (result?.ok === true) { documentText(result.text); return result; }
    if (result?.ok === false && typeof result.error?.code === 'string' && typeof result.error.message === 'string') return result;
    throw new Error('Invalid file-save response');
}
const codec = (name: string, parse: (value: unknown) => unknown) => ({
    mode: 'strict' as const, typeSymbol: `@1agents/feature-blueprint#${name}`, create: () => ({ parse }),
});
export const fileContribution = {
    package: '@1agents/feature-blueprint',
    descriptors: [{
        id: '@1agents/feature-blueprint#save', service: FILE_SERVICE, namespace: FILE_SERVICE, method: 'save',
        invocation: { kind: 'direct' as const }, cancellation: { parameter: 'signal' as const },
        parameters: [
            { name: 'address', wire: 'address', source: 'json' as const, codec: codec('FileAddress', value => { const address = stringOf(value); sessionFileOf(address); return address; }) },
            { name: 'expectedText', wire: 'expectedText', source: 'json' as const, codec: codec('FileText', stringOf) },
            { name: 'nodes', wire: 'nodes', source: 'json' as const, codec: codec('Nodes', nodesOf) },
        ],
        result: codec('SaveResult', resultOf),
    }],
};
