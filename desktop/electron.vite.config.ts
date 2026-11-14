import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Sandboxed preload scripts must use CommonJS, even with type: module.
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react()],
    // Define PostCSS plugins here instead of relying on config-file discovery.
    // This ensures Tailwind utilities are compiled in Electron-Vite's renderer,
    // even when the app is launched from a different working directory.
    css: {
      postcss: {
        plugins: [
          tailwindcss({ config: resolve(__dirname, 'tailwind.config.js') }),
          autoprefixer(),
        ],
      },
    },
  },
});
