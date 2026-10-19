import { execFileSync } from 'node:child_process';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { precompress } from './build/precompress.ts';

// The site's one version, from source/version.sh (docs/patterns/versioning.md): bundled for the About page and
// written to version.json, which the server reports at /api/version. Found through git, not a relative path, so it
// also resolves inside StrykerJS's sandbox copies.
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const version = execFileSync(`${repo}/source/version.sh`, { encoding: 'utf8' }).trim();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    precompress(),
    {
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
      },
    },
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  server: {
    proxy: {
      // Proxy API calls to the app service
      '/api': {
        target: process.env.SERVER_HTTPS || process.env.SERVER_HTTP,
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    pool: 'threads',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, '.stryker-tmp/**'],
  },
});
