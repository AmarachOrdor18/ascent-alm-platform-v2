// vite.config.ts
import { defineConfig } from "file:///C:/Users/AmarachiOrdor/Documents/Consulting%20Demo/ascent-alm-v2/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/AmarachiOrdor/Documents/Consulting%20Demo/ascent-alm-v2/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "node:path";
var __vite_injected_original_dirname = "C:\\Users\\AmarachiOrdor\\Documents\\Consulting Demo\\ascent-alm-v2";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__vite_injected_original_dirname, "./src") } },
  build: {
    // Route-level code splitting is done with React.lazy in App.tsx; this
    // additionally keeps the heavy vendor libraries out of the entry chunk
    // so first paint is not blocked by Recharts or the export libraries.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "wouter"],
          charts: ["recharts"],
          export: ["xlsx", "jspdf", "jspdf-autotable"],
          data: ["dexie", "@tanstack/react-query"]
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts"],
      // types.ts declares interfaces and unions only — it emits no runtime
      // code, so v8 reports every line as uncovered and drags the real
      // figure down. Test files are excluded for the same reason.
      exclude: ["src/engine/types.ts", "src/engine/**/*.test.ts"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxBbWFyYWNoaU9yZG9yXFxcXERvY3VtZW50c1xcXFxDb25zdWx0aW5nIERlbW9cXFxcYXNjZW50LWFsbS12MlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcQW1hcmFjaGlPcmRvclxcXFxEb2N1bWVudHNcXFxcQ29uc3VsdGluZyBEZW1vXFxcXGFzY2VudC1hbG0tdjJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL0FtYXJhY2hpT3Jkb3IvRG9jdW1lbnRzL0NvbnN1bHRpbmclMjBEZW1vL2FzY2VudC1hbG0tdjIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIHJlc29sdmU6IHsgYWxpYXM6IHsgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSB9IH0sXG4gIGJ1aWxkOiB7XG4gICAgLy8gUm91dGUtbGV2ZWwgY29kZSBzcGxpdHRpbmcgaXMgZG9uZSB3aXRoIFJlYWN0LmxhenkgaW4gQXBwLnRzeDsgdGhpc1xuICAgIC8vIGFkZGl0aW9uYWxseSBrZWVwcyB0aGUgaGVhdnkgdmVuZG9yIGxpYnJhcmllcyBvdXQgb2YgdGhlIGVudHJ5IGNodW5rXG4gICAgLy8gc28gZmlyc3QgcGFpbnQgaXMgbm90IGJsb2NrZWQgYnkgUmVjaGFydHMgb3IgdGhlIGV4cG9ydCBsaWJyYXJpZXMuXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHJlYWN0OiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICd3b3V0ZXInXSxcbiAgICAgICAgICBjaGFydHM6IFsncmVjaGFydHMnXSxcbiAgICAgICAgICBleHBvcnQ6IFsneGxzeCcsICdqc3BkZicsICdqc3BkZi1hdXRvdGFibGUnXSxcbiAgICAgICAgICBkYXRhOiBbJ2RleGllJywgJ0B0YW5zdGFjay9yZWFjdC1xdWVyeSddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNjAwLFxuICB9LFxuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcbiAgICBzZXR1cEZpbGVzOiBbJy4vdml0ZXN0LnNldHVwLnRzJ10sXG4gICAgY292ZXJhZ2U6IHtcbiAgICAgIHByb3ZpZGVyOiAndjgnLFxuICAgICAgaW5jbHVkZTogWydzcmMvZW5naW5lLyoqLyoudHMnXSxcbiAgICAgIC8vIHR5cGVzLnRzIGRlY2xhcmVzIGludGVyZmFjZXMgYW5kIHVuaW9ucyBvbmx5IFx1MjAxNCBpdCBlbWl0cyBubyBydW50aW1lXG4gICAgICAvLyBjb2RlLCBzbyB2OCByZXBvcnRzIGV2ZXJ5IGxpbmUgYXMgdW5jb3ZlcmVkIGFuZCBkcmFncyB0aGUgcmVhbFxuICAgICAgLy8gZmlndXJlIGRvd24uIFRlc3QgZmlsZXMgYXJlIGV4Y2x1ZGVkIGZvciB0aGUgc2FtZSByZWFzb24uXG4gICAgICBleGNsdWRlOiBbJ3NyYy9lbmdpbmUvdHlwZXMudHMnLCAnc3JjL2VuZ2luZS8qKi8qLnRlc3QudHMnXSxcbiAgICAgIHRocmVzaG9sZHM6IHsgbGluZXM6IDkwLCBmdW5jdGlvbnM6IDkwLCBicmFuY2hlczogODAsIHN0YXRlbWVudHM6IDkwIH0sXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEwWCxTQUFTLG9CQUFvQjtBQUN2WixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBRmpCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixTQUFTLEVBQUUsT0FBTyxFQUFFLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU8sRUFBRSxFQUFFO0FBQUEsRUFDNUQsT0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBLElBSUwsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sY0FBYztBQUFBLFVBQ1osT0FBTyxDQUFDLFNBQVMsYUFBYSxRQUFRO0FBQUEsVUFDdEMsUUFBUSxDQUFDLFVBQVU7QUFBQSxVQUNuQixRQUFRLENBQUMsUUFBUSxTQUFTLGlCQUFpQjtBQUFBLFVBQzNDLE1BQU0sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLFFBQ3pDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLEVBQ3pCO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixZQUFZLENBQUMsbUJBQW1CO0FBQUEsSUFDaEMsVUFBVTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsU0FBUyxDQUFDLG9CQUFvQjtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSTlCLFNBQVMsQ0FBQyx1QkFBdUIseUJBQXlCO0FBQUEsTUFDMUQsWUFBWSxFQUFFLE9BQU8sSUFBSSxXQUFXLElBQUksVUFBVSxJQUFJLFlBQVksR0FBRztBQUFBLElBQ3ZFO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
