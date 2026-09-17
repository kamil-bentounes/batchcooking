import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Batch cooking',
        short_name: 'Batch',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#F2F4EF',
        theme_color: '#2F5D45',
      },
    }),
  ],
})
