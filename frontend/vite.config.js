import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://surveysmart-production.up.railway.app',
        changeOrigin: true,
      },
      '/auth': {
        target: 'https://surveysmart-production.up.railway.app',
        changeOrigin: true,
      },
    },
  },
});
