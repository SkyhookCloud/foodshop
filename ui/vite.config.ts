import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls to the FastAPI backend during local dev
    proxy: {
      "/api": "http://localhost:8000",
      "/shop": "http://localhost:8000",
    },
  },
});
