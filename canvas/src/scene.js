/** Browser-independent persisted scene shared by the standalone and DSH editors. */
export function readCanvasScene(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.elements)) {
    throw new Error('A canvas scene requires an elements array');
  }
  if (value.type !== undefined && value.type !== 'excalidraw') throw new Error('Unsupported canvas format');
  if (value.version !== undefined && value.version !== 2) throw new Error('Unsupported canvas version');
  for (const element of value.elements) {
    if (!element || typeof element.id !== 'string' || !element.id || typeof element.type !== 'string'
      || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(element[key]))) {
      throw new Error('Invalid canvas element');
    }
  }
  if (value.appState !== undefined && (!value.appState || typeof value.appState !== 'object' || Array.isArray(value.appState))) {
    throw new Error('Invalid canvas appState');
  }
  if (value.files !== undefined && (!value.files || typeof value.files !== 'object' || Array.isArray(value.files))) {
    throw new Error('Invalid canvas files');
  }
  // Own the bytes: DSH stores freeze their values, while Excalidraw owns mutable internals.
  return JSON.parse(JSON.stringify({ elements: value.elements, files: value.files ?? {}, appState: {
    viewBackgroundColor: value.appState?.viewBackgroundColor ?? '#ffffff',
  } }));
}

export function snapshotCanvas(elements, appState, files) {
  return readCanvasScene({ elements, appState, files });
}

export const emptyCanvasScene = () => ({ elements: [], files: {}, appState: { viewBackgroundColor: '#ffffff' } });
