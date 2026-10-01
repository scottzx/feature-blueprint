import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { canvasBridge } from './src/server/canvas-bridge.js';

// A separate web root keeps Excalidraw assets out of the blueprint editor bundle.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [canvasBridge()],
  build: { outDir: 'dist', emptyOutDir: true },
});
