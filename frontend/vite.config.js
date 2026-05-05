import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/process": "http://127.0.0.1:8001",
      "/lectures": "http://127.0.0.1:8001",
      "/translate": "http://127.0.0.1:8001",
      "/transcribe-voice": "http://127.0.0.1:8001",
      "/health": "http://127.0.0.1:8001",
    },
  },
});
