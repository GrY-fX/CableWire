import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the static build works from any folder (GitHub Pages, intranet share).
  base: './',
  plugins: [
    svelte(),
    // Offline app: the service worker caches the built app (only in production builds).
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'CableWire',
        short_name: 'CableWire',
        description: 'Schemi elettrici nel browser, anche offline.',
        lang: 'it',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#e9ecef',
        theme_color: '#1d6fe0',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,webmanifest}'],
      },
    }),
  ],
});
