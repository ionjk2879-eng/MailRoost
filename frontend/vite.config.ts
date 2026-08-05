import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      // /auth/gmail/* 는 OAuth 리다이렉트라 gmailLoginUrl에서 :8787로 직접 이동하지만,
      // /auth/naver/connect 같은 일반 fetch 호출은 이 프록시를 통해 same-origin으로 처리한다.
      '/auth/naver': 'http://localhost:8787',
    },
  },
})
