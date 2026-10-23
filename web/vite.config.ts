import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pasta = import.meta.dirname

// Duas páginas: o webchat do cliente (/) e o console do atendente (/atendente).
export default defineConfig({
  root: pasta,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { webchat: resolve(pasta, 'index.html'), atendente: resolve(pasta, 'atendente.html') },
    },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
})
