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
        name: 'Popote',
        short_name: 'Popote',
        lang: 'fr',
        start_url: base,
        display: 'standalone',
        description: 'Ce qu’on mange et ce que ça coûte, à deux.',
        background_color: '#F2F4EF',
        theme_color: '#2F5D45',
        icons: [
          { src: `${base}icone-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icone-512.png`, sizes: '512x512', type: 'image/png' },
          // `maskable` : le système la recadre dans SA forme — cercle, goutte,
          // carré arrondi. Elle porte donc son fond jusqu'aux bords et garde la
          // marque au centre, sinon les coins se font rogner.
          { src: `${base}icone-maskable.png`, sizes: '512x512', type: 'image/png',
            purpose: 'maskable' },
        ],
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
