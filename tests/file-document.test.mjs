import assert from 'node:assert/strict';
import test from 'node:test';
import { readBlueprintDocument } from '../dist/document.js';
const node = { id: 'accounts', kind: 'module', title: '账号', position: 0, createdAt: '2026-10-01T00:00:00.000Z' };
const document = { format: '1agents.feature-blueprint', version: 1, nodes: [node] };

test('accepts supported files and preserves extension data', () => {
    const value = { ...document, metadata: { owner: 'scott' }, nodes: [{ ...node, notes: 'custom' }] };
    assert.deepEqual(readBlueprintDocument(value), value);
});
test('rejects unsupported envelopes, empty titles, invalid timestamps and unsafe positions', () => {
    for (const value of [null, {}, [], { ...document, version: 2 }, { ...document, format: 'other' },
        ...[{ title: ' ' }, { createdAt: '' }, { createdAt: '2026-02-30T00:00:00.000Z' },
            { position: Number.MAX_SAFE_INTEGER + 1 }, { parentId: '' }, { notes: null }, { notes: [] }].map(fields => ({ ...document, nodes: [{ ...node, ...fields }] })),
    ]) assert.throws(() => readBlueprintDocument(value));
});
