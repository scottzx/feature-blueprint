export interface CanvasScene {
  elements: Record<string, unknown>[];
  files: Record<string, unknown>;
  appState: { viewBackgroundColor: string };
}
export function readCanvasScene(value: unknown): CanvasScene;
export function snapshotCanvas(elements: readonly unknown[], appState: unknown, files: unknown): CanvasScene;
export function emptyCanvasScene(): CanvasScene;
