import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const DEV_PORT = 14510;
const HMR_PORT = 14511;
const PREVIEW_PORT = 14512;

/**
 * Prints what the dev app window reports (hot updates it applied, failed
 * updates, console errors) to the dev server output, so the dev log shows
 * whether an edit really reached the window. See src/main.tsx.
 */
const clientLog = {
  name: "kaleidosage-client-log",
  configureServer(server: import("vite").ViteDevServer) {
    server.ws.on("kaleidosage:log", (data: { message?: string }) => console.log(`[client] ${String(data?.message ?? "").slice(0, 4000)}`));
  }
};

export default defineConfig({
  plugins: [react(), clientLog],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: HMR_PORT } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/*.md", "**/prototype.html", "**/test-images/**", "**/tools/**"] }
  },
  preview: {
    port: PREVIEW_PORT,
    strictPort: true
  }
});
