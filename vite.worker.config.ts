import { defineConfig } from 'vite';

// O worker de dados sai como dist/worker.js (IIFE, script clássico) para o runtime da TV.
export default defineConfig({
  build: {
    target: 'chrome76',
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: 'src/data/worker.ts',
      formats: ['iife'],
      name: 'NyxWorker',
      fileName: () => 'worker.js',
    },
  },
});
