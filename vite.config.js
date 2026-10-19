import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' })],
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase':     ['@supabase/supabase-js'],
          'data-layer':   ['./data.js'],
        }
      }
    }
  },
  server: {
    port: 8000, open: true,
    proxy: { '/api': { target: 'http://localhost:8788', changeOrigin: true } }
  }
});
