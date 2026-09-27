import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' — чтобы сборка работала из любой папки хостинга (GitHub Pages, Cloudflare Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
})
