import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["tests/**", "node_modules/**", "dist/**"],
    // PocketBase realtime uses the global EventSource. Node 22 exposes it behind this flag.
    poolOptions: {
      forks: {
        execArgv: ["--experimental-eventsource"],
      },
    },
  },
});
