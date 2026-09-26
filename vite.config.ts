import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: { rollupOptions: { output: { manualChunks: { graph: ['cytoscape'] } } } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});