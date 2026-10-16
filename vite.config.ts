import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import pkg from "./package.json";

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

/** Writes the app version into the splash page (splash.html), which has no script. */
const appVersion = {
  name: "kaleidosage-app-version",
  transformIndexHtml: (html: string) => html.replaceAll("%APP_VERSION%", pkg.version)
};

export default defineConfig({
  plugins: [react(), clientLog, appVersion],
  build: {
    rollupOptions: {
      input: { main: path.resolve(__dirname, "index.html"), splash: path.resolve(__dirname, "splash.html") }
    }
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: HMR_PORT } : undefined,
    /* Files are checked on a timer: Windows change events sometimes never arrive, and the window then keeps old code. */
    watch: { usePolling: true, interval: 250, ignored: ["**/src-tauri/**", "**/*.md", "**/prototype.html", "**/test-images/**", "**/tools/**"] }
  },
  preview: {
    port: PREVIEW_PORT,
    strictPort: true
  }
});
