import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    // Impede Vite de embutir fontes <4KB como data: URI, mantendo CSP estrita (font-src 'self')
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ['@votz/shared-types', '@votz/zod-schemas'],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@votz/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@votz/zod-schemas': path.resolve(__dirname, '../../packages/zod-schemas/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; media-src 'self' blob: https:; connect-src 'self' http://localhost:3000 ws://localhost:3000 https://api.maptiler.com https://*.livekit.cloud wss://*.livekit.cloud https://brasilapi.com.br; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self)',
    },
  },
})
