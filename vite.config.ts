import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    // The game is one screen that needs every module the moment it opens (title, both layers, all five ships' data
    // and text), so code-splitting would only add requests: the main chunk is about 540 kB, 190 kB gzipped (WP12).
    // The limit sits above it with room to grow, so the build still warns if something big lands by accident.
    chunkSizeWarningLimit: 800,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@state': resolve(__dirname, 'src/state'),
      '@data': resolve(__dirname, 'src/data'),
      '@components': resolve(__dirname, 'src/components'),
      '@systems': resolve(__dirname, 'src/systems'),
      '@styles': resolve(__dirname, 'src/styles'),
    },
  },
  server: {
    port: 5173,
    open: true,
    // .tmp/ is gitignored scratch (tests, screenshots, unpacked snapshots). A copied index.html
    // or tsconfig.json in there would otherwise force a full reload of every open game tab.
    // .claude/ holds agents' git worktrees (whole copies of the repo, index.html included), and
    // tests/.out/ holds e2e output: an edit in either reloaded the e2e tier's page mid-flight.
    // Anchored to this checkout's root: a worktree itself lives under .claude/, so '**/.claude/**' would ignore all of it.
    watch: { ignored: ['**/.tmp/**', `${resolve(__dirname, '.claude')}/**`, `${resolve(__dirname, 'tests/.out')}/**`] },
  },
});
