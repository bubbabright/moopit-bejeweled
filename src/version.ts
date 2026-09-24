/**
 * Build identity.
 *
 * `__APP_VERSION__` and `__BUILD_ID__` are stamped in by vite.config.ts at build
 * time. They exist so you can tell which build is actually running — the auto-deploy
 * pipeline makes it easy to lose track, and a deployed fix that still looks broken is
 * usually just a stale bundle in a cache.
 *
 * The `typeof` guards keep this importable from anywhere (including the engine
 * self-test and any tooling) even if the defines are absent.
 */

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'local';

/** e.g. "v0.2.0 · d07b4a8" — version first, then the commit it was built from. */
export const VERSION_LABEL = `v${APP_VERSION} · ${BUILD_ID}`;
