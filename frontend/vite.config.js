import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  envDir: fileURLToPath(new URL('../', import.meta.url)),
  server: {
    host: '127.0.0.1',
    open: 'http://127.0.0.1:5174/',
    port: 5174,
    strictPort: true,
    proxy: { '/about.json': 'http://127.0.0.1:3001', '/api': 'http://127.0.0.1:3001' },
  },
});
