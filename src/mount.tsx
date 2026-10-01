/** Mount the Preact editor in DOM owned exclusively by a React or plain-JS embedding. */
import { render } from 'preact';
import { BlueprintEditor, type BlueprintEditorProps } from './editor.js';

/** Update or dispose one isolated editor. */
export interface MountedBlueprint {
    /** @param props - Latest host-owned data and labels. */
    update: (props: BlueprintEditorProps) => void;
    /** Release component hooks and the editor's DOM. */
    dispose: () => void;
}

/**
 * Mount without sharing framework hooks with the parent application.
 * @param element - Empty DOM element exclusively owned by this editor.
 * @param props - Initial data, copy and save callback.
 * @returns Updates preserve selection; disposal unmounts the complete editor.
 */
export function mountBlueprint(element: HTMLElement, props: BlueprintEditorProps): MountedBlueprint {
    render(<BlueprintEditor {...props} />, element);
    return {
        update: next => render(<BlueprintEditor {...next} />, element),
        dispose: () => render(null, element),
    };
}
