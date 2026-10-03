import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'supabase':   ['@supabase/supabase-js'],
          'data-layer': ['./data.js'],
        }
      }
    }
  },
  server: {
    port: 8000,
    open: true
  }
});
