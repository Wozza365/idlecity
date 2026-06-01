import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();

export default defineConfig({
  define: { __GIT_HASH__: JSON.stringify(gitHash) },
  base: process.env.NODE_ENV === 'production' ? '/idlecity/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
