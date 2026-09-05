import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    // Drop debug-level console calls from production bundles; keep error/warn for observability
    pure: ['production', 'native'].includes(mode) ? ['console.log', 'console.info', 'console.debug'] : [],
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
      /**
       * Split the vendor bundle. Routes were already lazy-loaded (33 of them),
       * but everything they share collapsed into one ~580 KB entry chunk that
       * every cold start had to download before anything rendered — the cost
       * that matters most on the phone, which is the primary target.
       *
       * Bucketed by library rather than one big `vendor` chunk so that a
       * change in app code does not invalidate React, and a Supabase bump
       * does not invalidate the icons. Only genuinely large, stable
       * dependencies are split out; everything else stays in the entry chunk
       * where a separate request would cost more than it saves.
       */
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // react + react-dom + scheduler move together: splitting them apart
          // just adds a request, since nothing renders without all three.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('date-fns')) return 'date-fns';
        },
      },
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
