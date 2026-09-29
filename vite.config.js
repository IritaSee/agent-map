import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.AGENTMAP_API_PORT) || 8787;

// Starts the local chat companion (server/index.mjs) alongside `npm run dev`
// so one command still boots the whole app. For a static `build`/`preview`
// deploy, run `npm run api` separately — chat needs the companion process.
function apiCompanion() {
  let srv;
  return {
    name: 'agentmap-api-companion',
    async configureServer() {
      const { createServer } = await import('./server/index.mjs');
      srv = createServer();
      srv.listen(API_PORT, '127.0.0.1', () => {
        console.log(`[agentmap] API companion siap di http://127.0.0.1:${API_PORT}`);
      });
    },
    closeBundle() {
      srv?.close();
    },
  };
}

export default defineConfig({
  plugins: [react(), apiCompanion()],
  base: './',
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
});
