import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/.venv/**', '**/.venv312/**', '**/artifacts/**', '**/backend/data/**', '**/data/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
