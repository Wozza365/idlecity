import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/idlecity/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
