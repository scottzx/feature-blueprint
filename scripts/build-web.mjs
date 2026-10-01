import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(resolve(root, 'web-dist'), { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['web/editor.ts'], outfile: 'web-dist/editor.js', bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022' });
await copyFile(resolve(root, 'web/index.html'), resolve(root, 'web-dist/index.html'));
await writeFile(resolve(root, 'web-dist/style.css'),
    await readFile(resolve(root, 'src/style.css'), 'utf8') + '\n' + await readFile(resolve(root, 'web/style.css'), 'utf8'));
