import { defineConfig, loadEnv } from 'vite';
import { version as pkgVersion } from './package.json';

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
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
    },
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
  };
});
