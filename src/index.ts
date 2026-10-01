/** Shared model API and the no-op Host face of the browser-only DSH plugin. */
export * from './model.js';

/** DSH discovers the declared client entry; no Host services are registered. */
export function apply(): void {}
