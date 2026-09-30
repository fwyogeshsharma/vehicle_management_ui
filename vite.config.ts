import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 5173 is not incidental: it is the origin the API allows by default
// (vehicle-management.cors.allowed-origins). Change it here and you must change it there,
// or every request fails preflight and the browser reports an unhelpful CORS error.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
