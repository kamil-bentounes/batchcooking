import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages sert le site sous /batchcooking/. En local la base reste '/'.
const base = process.env.PAGES ? '/batchcooking/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Batch cooking',
        short_name: 'Batch',
        lang: 'fr',
        start_url: base,
        display: 'standalone',
        background_color: '#F2F4EF',
        theme_color: '#2F5D45',
      },
    }),
  ],
  test: {
    // Les tests de FUMÉE en navigateur appartiennent à Playwright, qui a son
    // propre lanceur. Les laisser ici les ferait échouer au chargement — et
    // faire cohabiter deux lanceurs sur le même fichier n'a aucun sens.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
})
