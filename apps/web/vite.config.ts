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
    include: ['@votz/zod-schemas'],
    // This alias points at workspace ESM source. Prebundling freezes its exports
    // until Vite's next dependency scan, breaking newly added shared contracts.
    exclude: ['@votz/shared-types', '@votz/chat-core', '@matrix-org/matrix-sdk-crypto-wasm'],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@votz/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@votz/chat-core': path.resolve(__dirname, '../../packages/chat-core/src/index.ts'),
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
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; media-src 'self' blob: https:; connect-src 'self' http://localhost:3000 ws://localhost:3000 https://api.maptiler.com https://*.livekit.cloud wss://*.livekit.cloud https://brasilapi.com.br; worker-src 'self' blob:; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self)',
    },
  },
})
