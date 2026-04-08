import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 3000,
      proxy: apiProxyTarget
        ? {
            '/api': {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: false
            }
          }
        : undefined
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true
    },
    // Ensure assets are loaded correctly in production
    base: './'
  }
})
