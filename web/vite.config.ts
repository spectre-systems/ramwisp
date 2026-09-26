import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 4801, proxy: { '/api': 'http://127.0.0.1:4800', '/wisp.tgz': 'http://127.0.0.1:4800' } },
})
