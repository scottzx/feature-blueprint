/** Bundle shared tree code while obtaining DSH's React and store from its ModuleLoader. */
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const dependencies = ['react', 'react-dom', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'];
const output = resolve(root, 'packages/dsh-plugin/dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const cssText = {
    name: 'inline-canvas-css-assets',
    setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, async ({ path }) => {
            const css = await build({ entryPoints: [path], bundle: true, write: false,
                loader: { '.woff2': 'dataurl', '.woff': 'dataurl' }, logLevel: 'silent' });
            return { contents: `export default ${JSON.stringify(css.outputFiles[0].text)};`, loader: 'js' };
        });
    },
};
const common = {
    absWorkingDir: root, bundle: true,
    platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic', jsxImportSource: 'react',
    external: [...dependencies, 'react/jsx-runtime'], loader: { '.css': 'text' }, write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    conditions: ['production'],
};
let canvasRevision;
for (const [entry, file, chunk] of [
    ['packages/dsh-plugin/src/canvas-runtime.ts', 'client.canvas.js', 'client.canvas.js'],
    ['packages/dsh-plugin/src/client.tsx', 'client.js', undefined],
]) {
    const result = await build({ ...common, entryPoints: [entry],
        ...(chunk ? { minify: true, plugins: [cssText], metafile: true } : {}) });
    const wrapped = `${chunk ? '' : `// Canvas runtime revision: ${canvasRevision}\n`}window.__ModuleLoader__.load({id:"@1agents/feature-blueprint",${chunk ? `chunk:${JSON.stringify(chunk)},` : ''}dependencies:${JSON.stringify([...dependencies, 'react/jsx-runtime'])},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`;
    await writeFile(resolve(output, file), wrapped);
    if (chunk) {
        // The Host versions lazy chunks with the main entry's revision; include their bytes in that identity.
        canvasRevision = createHash('sha256').update(wrapped).digest('hex');
        // Catch a second framework runtime in the published client, including transitive libraries.
        for (const input of Object.keys(result.metafile.inputs)) {
            if (/node_modules\/(?:react|react-dom)\//.test(input)) throw new Error(`Canvas bundled the host runtime: ${input}`);
        }
    }
}
