import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  server: { port: 3000, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
