import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5310, strictPort: true },
  preview: { port: 4310, strictPort: true },
});
