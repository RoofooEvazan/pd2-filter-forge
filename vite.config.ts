import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// Tauri expects a fixed port and no screen clearing so its own logs stay visible.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 1427, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  // This folder can be reached through two Windows paths (AppData vs. its packaged alias); keep
  // module ids on the path we were started from so the dev server still transforms them.
  resolve: { preserveSymlinks: true },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
  test: { environment: "node" },
} as any);
