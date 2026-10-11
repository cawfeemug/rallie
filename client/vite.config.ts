import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs on :4000 and Vite proxies to it, so the browser only talks to
// one origin, exactly like production (nginx does the same job there).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from phones on the same Wi-Fi for testing
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
