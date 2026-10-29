import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works from any folder (GitHub Pages, intranet share).
  base: './',
  plugins: [svelte()],
});
