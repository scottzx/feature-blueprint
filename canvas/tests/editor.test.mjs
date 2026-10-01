import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { fileURLToPath } from 'node:url';

test('the shared canvas emits host React elements despite the blueprint Preact tsconfig', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/editor.jsx', import.meta.url))],
    bundle: true, write: false, platform: 'browser', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', '@excalidraw/excalidraw'] });
  const require = createRequire(import.meta.url);
  const exports = runInNewContext(`(function(require) { const module = { exports: {} }; const exports = module.exports; ${result.outputFiles[0].text}; return module.exports; })`)(id => {
    if (id === '@excalidraw/excalidraw') return { Excalidraw: () => React.createElement('span', null, 'canvas engine') };
    return require(id);
  });
  const rendered = renderToString(React.createElement(exports.CanvasEditor, {}));
  assert.match(rendered, /oneagents-canvas-surface/);
  assert.match(rendered, /canvas engine/);
});
