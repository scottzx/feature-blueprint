/** File editing state: serialize saves and retire stale preview refreshes. */
import type { BlueprintDocument } from '../../../dist/document.js';
import type { BlueprintNode } from '../../../dist/model.js';
import { documentText, type SaveFile, type SaveResult } from './file-rpc.js';

export interface FileEditorState {
    document: BlueprintDocument;
    text: string;
    saving: boolean;
    saved: boolean;
    error?: { code: string; message: string };
    draft?: string;
}

export class FileEditor {
    state: FileEditorState;
    private incoming: string;
    private deferred?: string;
    private readonly controller = new AbortController();
    constructor(text: string, private readonly address: string, private readonly write: SaveFile,
        private readonly changed: (state: FileEditorState) => void) {
        this.incoming = text;
        this.state = { document: documentText(text), text, saving: false, saved: false };
    }
    receive(text: string): void {
        if (this.controller.signal.aborted || text === this.incoming) return;
        documentText(text);
        this.incoming = text;
        if (this.state.saving) { this.deferred = text; return; }
        this.publish({ ...this.state, document: documentText(text), text, saved: false });
    }
    async save(nodes: readonly BlueprintNode[]): Promise<void> {
        if (this.controller.signal.aborted || this.state.saving) return;
        const expected = this.state.text;
        const draft = `${JSON.stringify({ ...this.state.document, nodes }, null, 2)}\n`;
        this.publish({ ...this.state, saving: true, saved: false, error: undefined, draft: undefined });
        let result: SaveResult;
        try { result = await this.write(this.address, expected, nodes, this.controller.signal); }
        catch (error) { result = { ok: false, error: { code: 'SAVE_FAILED', message: error instanceof Error ? error.message : String(error) } }; }
        if (this.controller.signal.aborted) return;
        const next: FileEditorState = result.ok
            ? { document: documentText(result.text), text: result.text, saving: false, saved: true }
            : { ...this.state, saving: false, error: result.error, draft };
        // A refresh that began before this save may still carry the old bytes.
        if (this.deferred !== undefined && this.deferred !== expected && this.deferred !== next.text) {
            next.document = documentText(this.deferred); next.text = this.deferred; next.saved = false;
        }
        this.deferred = undefined;
        this.publish(next);
    }
    dispose(): void { this.controller.abort(); }
    private publish(state: FileEditorState): void { this.state = state; this.changed(state); }
}
