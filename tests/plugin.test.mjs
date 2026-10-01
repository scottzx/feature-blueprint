import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

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
        sidebarRightTabs: { register(type) { assert.equal(type.kind, 'oneagents-blueprint'); assert.strictEqual(type.guide[0].icon, icon); return retain(types, type); } },
        documentPreviews: { register(viewer) {
            assert.equal(viewer.id, `${definition.id}/file`);
            assert.equal(viewer.loading, 'bytes-complete');
            assert.deepEqual(Array.from(viewer.extensions), ['blueprint.json']);
            return retain(viewers, viewer);
        } },
        slots: {
            inject(name, register) { assert.ok(['sidebar.right.pane.tab', 'sidebar.right.tab.document'].includes(name)); return register(); },
            register(options) {
                if (options.name === 'sidebar.right.pane.tab') {
                    assert.equal(options.key, definition.id); assert.equal(options.store.persist, 'oneagents.feature-blueprint.v1');
                } else assert.equal(options.key, `${definition.id}/file`);
                return retain(bodies, options);
            },
        },
    };
    exports.apply(ctx);
    assert.deepEqual([styles.size, dictionaries.size, types.size, bodies.size, viewers.size], [1, 1, 1, 2, 1]);
    for (const dispose of disposers.reverse()) dispose();
    assert.deepEqual([styles.size, dictionaries.size, types.size, bodies.size, viewers.size], [0, 0, 0, 0, 0]);
});
