import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    // Route-level code splitting is done with React.lazy in App.tsx; this
    // additionally keeps the heavy vendor libraries out of the entry chunk
    // so first paint is not blocked by Recharts or the export libraries.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'wouter'],
          charts: ['recharts'],
          export: ['xlsx', 'jspdf', 'jspdf-autotable'],
          data: ['dexie', '@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
