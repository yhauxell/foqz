import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // Required for `loadFile(.../dist/index.html)` in Electron: absolute `/assets/...` breaks under file://.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // capture.html is the global quick capture panel, a window of its own.
      input: {
        main: path.resolve(__dirname, "index.html"),
        capture: path.resolve(__dirname, "capture.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api/typesafe": {
        target: "https://api.typesafe.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/typesafe/, ""),
      },
    },
  },
})
