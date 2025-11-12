import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/itu-proxy': {
        target: 'https://bbmaps.itu.int',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/itu-proxy/, ''),
        secure: false
      },
      '/api/hifld-proxy': {
        target: 'https://services1.arcgis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hifld-proxy/, '/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query'),
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  // Ensure assets are loaded correctly in production
  base: './'
})