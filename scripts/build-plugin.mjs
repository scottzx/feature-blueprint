/** Bundle shared tree code while obtaining DSH's React and store from its ModuleLoader. */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dependencies = ['react', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'];
const result = await build({
    absWorkingDir: root, entryPoints: ['packages/dsh-plugin/src/client.tsx'], bundle: true,
    platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic', jsxImportSource: 'react',
    external: [...dependencies, 'react/jsx-runtime'], loader: { '.css': 'text' }, write: false,

});
await mkdir(resolve(root, 'packages/dsh-plugin/dist'), { recursive: true });
await writeFile(resolve(root, 'packages/dsh-plugin/dist/client.js'),
    `window.__ModuleLoader__.load({id:"@1agents/feature-blueprint",dependencies:${JSON.stringify([...dependencies, 'react/jsx-runtime'])},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
