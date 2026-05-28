import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/lm-studio': {
          target: 'http://localhost:1234',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lm-studio/, ''),
        },
      },
    },
  };
});
