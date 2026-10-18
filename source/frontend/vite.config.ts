import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { precompress } from './build/precompress.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), precompress()],
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
