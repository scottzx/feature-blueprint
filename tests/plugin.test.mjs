import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../packages/dsh-plugin/dist/client.js', import.meta.url), 'utf8');

test('registers sidebar editing and compound-suffix file viewing, releasing all registrations', () => {
    let definition;
    runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value; } } } });
    assert.equal(definition.id, '@1agents/feature-blueprint');
    const styles = new Set(), dictionaries = new Set(), types = new Set(), bodies = new Set(), viewers = new Set();
    const document = {
        createElement() { const sheet = { textContent: '', remove() { styles.delete(sheet); } }; return sheet; },
        head: { append(sheet) { styles.add(sheet); } },
    };
    const icon = () => null;
    const modules = {
        react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'),
        '@deepseek-ai/dsh-client-store': { defineStore: value => value },
        '@deepseek-ai/dsh-client-ui-primitives': { IconWorkspaceTreeOutlineRegular: icon },
    };
    // Execute the same published client wrapper with isolated registration owners.
    const exports = runInNewContext(`(${definition.factory.toString()})`, { document })(id => modules[id]);
    const disposers = [];
    const retain = (set, value) => { set.add(value); return () => set.delete(value); };
    const ctx = {
        effect(effect) { disposers.push(effect()); },
        locale: { bind() { return key => key; }, register(ns) { return retain(dictionaries, ns); } },
        sidebarRightTabs: { register(type) {
            assert.equal(type.kind, type.id.endsWith('/canvas') ? 'oneagents-canvas' : 'oneagents-blueprint');
            assert.strictEqual(type.guide[0].icon, icon); return retain(types, type);
        } },
        documentPreviews: { register(viewer) {
            const canvas = viewer.id === `${definition.id}/canvas/file`;
            assert.equal(viewer.id, canvas ? `${definition.id}/canvas/file` : `${definition.id}/file`);
            assert.equal(viewer.loading, 'bytes-complete');
            assert.deepEqual(Array.from(viewer.extensions), canvas ? ['excalidraw'] : ['blueprint.json']);
            return retain(viewers, viewer);
        } },
        slots: {
            inject(name, register) { assert.ok(['sidebar.right.pane.tab', 'sidebar.right.tab.document'].includes(name)); return register(); },
            register(options) {
                if (options.name === 'sidebar.right.pane.tab') {
                    const canvas = options.key === `${definition.id}/canvas`;
                    assert.equal(options.key, canvas ? `${definition.id}/canvas` : definition.id);
                    assert.equal(options.store.persist, canvas ? 'oneagents.excalidraw.v1' : 'oneagents.feature-blueprint.v1');
                } else assert.ok([`${definition.id}/file`, `${definition.id}/canvas/file`].includes(options.key));
                return retain(bodies, options);
            },
        },
    };
    for (let reload = 0; reload < 2; reload++) {
        exports.apply(ctx);
        assert.deepEqual([styles.size, dictionaries.size, types.size, bodies.size, viewers.size], [2, 2, 2, 4, 2]);
        for (const dispose of disposers.splice(0).reverse()) dispose();
        assert.deepEqual([styles.size, dictionaries.size, types.size, bodies.size, viewers.size], [0, 0, 0, 0, 0]);
    }
});

test('keeps the canvas runtime in a DSH package-local lazy chunk', () => {
    let registration;
    const chunk = readFileSync(new URL('../packages/dsh-plugin/dist/client.canvas.js', import.meta.url), 'utf8');
    runInNewContext(chunk, { window: { __ModuleLoader__: { load(value) { registration = value; } } } });
    assert.equal(registration.id, '@1agents/feature-blueprint');
    assert.equal(registration.chunk, 'client.canvas.js');
    assert.match(source, /require\.async\(['"]\.\/client\.canvas\.js['"]\)/);
    assert.ok(source.length < 200_000, 'the main registration should not contain the Excalidraw engine');
    assert.ok(registration.dependencies.includes('react-dom'), 'canvas uses the host DOM runtime');
    assert.ok(source.includes(createHash('sha256').update(chunk).digest('hex')), 'main revision must change when the lazy runtime changes');
});
