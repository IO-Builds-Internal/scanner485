import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const FRONTEND_PORT = process.env.PORT || '5173';
const BACKEND_PORT = process.env.VITE_BACKEND_PORT || '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(FRONTEND_PORT, 10),
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
