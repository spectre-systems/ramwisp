import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // mantém os JS de builds anteriores: quem ainda tem o index antigo continua funcionando
  build: { emptyOutDir: false },
  server: { port: 4801, proxy: { '/api': 'http://127.0.0.1:4800', '/wisp.tgz': 'http://127.0.0.1:4800' } },
})
