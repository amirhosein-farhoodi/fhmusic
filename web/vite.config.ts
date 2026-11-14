import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, the Python backend runs on :8000 (uv run autodj-web) and Vite proxies the socket.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1600 },
  server: {
    proxy: { "/ws": { target: "ws://127.0.0.1:8000", ws: true } },
  },
});
