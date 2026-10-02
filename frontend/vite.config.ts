import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks to the FastAPI backend through `/api`, so the app works
// from any host and no localhost URL is hardcoded in the client code.
//
// When the backend isn't running, http-proxy would answer with a bare 500. We
// substitute a 503 carrying a readable reason so the UI can say something
// useful instead of "Internal Server Error".
const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
    configure: (proxy, _options) => {
      proxy.on('error', (_error, _req, res) => {
        if (res.writableEnded || res.headersSent) return
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            detail:
              'Gist can’t reach its local backend, so it can’t read your notes right now. Start it on port 8000 and try again.',
          })
        )
      })
    },
  },
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  // `npm run build && npm run preview` works offline too, proxy included.
  preview: { port: 4173, proxy: apiProxy },
})
