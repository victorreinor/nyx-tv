import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { shellHash } from './scripts/shell.ts';

// Carregador da atualização sem cabo: dist/boot.js (IIFE, script clássico). Ver src/boot/loader.ts.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __SHELL__: JSON.stringify(shellHash()) },
  build: {
    target: 'chrome76',
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    lib: {
      entry: 'src/boot/loader.ts',
      formats: ['iife'],
      name: 'NyxLoader',
      fileName: () => 'boot.js',
    },
  },
});
