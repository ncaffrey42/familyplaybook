import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    // Drop debug-level console calls from production bundles; keep error/warn for observability
    pure: mode === 'production' ? ['console.log', 'console.info', 'console.debug'] : [],
  },
  server: {
    host: '::',
    port: 3000,
    cors: true,
    headers: {
      // Required for SharedArrayBuffer (used by @ffmpeg/ffmpeg)
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  resolve: {
    extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Babel packages are Hostinger visual-editor deps — not needed at runtime
      external: [
        '@babel/parser',
        '@babel/traverse',
        '@babel/generator',
        '@babel/types',
      ],
    },
  },
}));
