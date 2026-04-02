import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Slim static site for GitHub Pages / any host. Not bundled into the Electron app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // CI writes release-embed.json here so GitHub Pages serves it same-origin (no browser → api.github.com).
  publicDir: path.resolve(__dirname, "landing-public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist-landing",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "landing.html"),
    },
  },
  base: process.env.VITE_BASE ?? "/",
})
