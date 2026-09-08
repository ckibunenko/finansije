import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(['/api', '/oauth', '/openapi.json', '/privacy'].map((path) => [path, 'http://127.0.0.1:8787'])),
  },
});
