import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCanvasScene, snapshotCanvas, emptyCanvasScene } from '../src/scene.js';

test('restores canvas files and clones frozen session values, preserving element and image data', () => {
  const source = Object.freeze({ type: 'excalidraw', version: 2,
    elements: [Object.freeze({ id: 'text', type: 'text', x: 10, y: 20, width: 100, height: 24, text: '想法', customData: { connection: ['a', 'b'] } })],
    files: { image: { id: 'image', dataURL: 'data:image/png;base64,AA==', mimeType: 'image/png', created: 1 } },
    appState: { viewBackgroundColor: '#fafafa', selectedElementIds: { text: true }, collaborators: {} },
  });
  const scene = readCanvasScene(source);
  assert.equal(scene.elements[0].text, '想法');
  assert.equal(scene.files.image.dataURL, source.files.image.dataURL);
  assert.deepEqual(scene.appState, { viewBackgroundColor: '#fafafa' });
  scene.elements[0].text = '修改';
  assert.equal(source.elements[0].text, '想法');
  assert.deepEqual(snapshotCanvas([], { viewBackgroundColor: '#ffffff', selectedElementIds: {} }, {}), emptyCanvasScene());
});

test('rejects unsupported or malformed scenes before entering the renderer', () => {
  for (const value of [null, {}, { elements: {} }, { elements: [null] },
    { elements: [], type: 'other' }, { elements: [], version: 1 },
    { elements: [], appState: null }, { elements: [], files: [] },
    { elements: [{ id: 'a', type: 'text', x: NaN, y: 0, width: 1, height: 1 }] }]) {
    assert.throws(() => readCanvasScene(value));
  }
});
