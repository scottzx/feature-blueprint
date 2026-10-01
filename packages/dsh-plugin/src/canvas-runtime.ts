/** This entry is built into a lazy package-local Client chunk, using the host's React. */
export { CanvasEditor } from '../../../canvas/src/editor.jsx';
import style from '@excalidraw/excalidraw/index.css';

let users = 0;
let sheet: HTMLStyleElement | undefined;
/** Scope the runtime sheet to mounted canvas bodies, including file previews. */
export function retainCanvasStyle(): () => void {
    if (users++ === 0) {
        sheet = document.createElement('style');
        sheet.dataset.plugin = '@1agents/feature-blueprint';
        sheet.dataset.pluginCss = 'oneagents-canvas';
        sheet.textContent = style;
        document.head.append(sheet);
    }
    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (--users === 0) { sheet?.remove(); sheet = undefined; }
    };
}
