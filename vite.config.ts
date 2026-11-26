import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devtoolsJson()
  ],
  server: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    allowedHosts: true,
    proxy: {
      '/api/gstin': {
        target: 'https://www.gstinapi.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gstin/, '')
      }
    }
  },
  preview: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    allowedHosts: true,
    proxy: {
      '/api/gstin': {
        target: 'https://www.gstinapi.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gstin/, '')
      }
    }
  }
});
