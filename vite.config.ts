import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the build portable (Netlify root, subpath, or local file server).
  base: './',
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
});
