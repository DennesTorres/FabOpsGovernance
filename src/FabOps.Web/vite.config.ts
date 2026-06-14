import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local development: the Azure Functions host (FabOps.Api).
      "/api": {
        target: "http://localhost:7071",
        changeOrigin: true,
      },
    },
  },
});
