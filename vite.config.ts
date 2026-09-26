import { defineConfig, loadEnv } from 'vite';
import { version as pkgVersion, codename } from './package.json';

export default defineConfig(({ mode }) => {
  // Prefix '' returns every env var, so only read the keys we mean to stamp.
  // Never spread this object into `define`, or secrets would end up in the bundle.
  const env = loadEnv(mode, '.', '');

  // Netlify sets COMMIT_REF when it builds from git; GIT_COMMIT covers local builds
  // that want the same stamp. Falls back to 'local' for a plain dev run.
  const buildId = (env.COMMIT_REF ?? env.GIT_COMMIT ?? 'local').slice(0, 7);

  return {
    // Relative base keeps the build portable (Netlify root, subpath, or local file server).
    base: './',
    define: {
      // Surfaced by src/version.ts, shown in the menu and reported by the test tools.
      __APP_VERSION__: JSON.stringify(pkgVersion),
      __BUILD_ID__: JSON.stringify(buildId),
      // Internal only (devtools + test tools, not the menu): the release codename Daniel sets
      // in package.json, and when this bundle was built, to the minute, in UTC.
      __CODENAME__: JSON.stringify(codename ?? ''),
      __BUILD_TIME__: JSON.stringify(`${new Date().toISOString().slice(0, 16)}Z`),
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
    },
    // GEMFALL owns ports 4770–4789 (see docs/DEVELOPING.md). This PC runs dev servers for other
    // projects too, so never fall back to Vite's defaults, and never hop to the next free port
    // (it could be another project's): strictPort makes a clash fail loudly instead.
    server: {
      host: true,
      port: 4770,
      strictPort: true,
    },
    preview: {
      host: true,
      port: 4771,
      strictPort: true,
    },
  };
});
