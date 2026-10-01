/** Shared model API and lazy Host entry for the DSH plugin. */
export * from './model.js';

export const inject = ['fs', 'sandboxPolicy', 'sessions', 'sessionPersistence', 'typert'];

/** Load DSH file services only when installed as a Host plugin. */
export async function apply(ctx: unknown): Promise<void> {
    const host = await import(new URL('../packages/dsh-plugin/dist/host.js', import.meta.url).href);
    await host.apply(ctx);
}
