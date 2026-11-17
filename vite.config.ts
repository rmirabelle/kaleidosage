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

/**
 * Dev only: `curl http://localhost:14510/__help-shots` tells the dev app
 * window to make the help pictures again (src/help/capture.ts). Add
 * `?only=files` to make only the pictures whose name starts with "files",
 * or the whole group of that name (see Shot.group in src/help/shots.ts).
 * Pictures named "readme-..." are for README.md: they are made only when
 * asked for by name.
 *
 * `curl "http://localhost:14510/__help-preview?chapter=scenes&scroll=600"`
 * opens the help window at that chapter and writes a picture of the window
 * to public/help/preview.png (not kept in Git), to check a chapter's layout.
 * The first call only opens the window; call it again for the picture.
 * Add `&zoom=0.4` to see a whole chapter in one picture.
 */
const helpShots = {
  name: "kaleidosage-help-shots",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use("/__help-shots", (request, response) => {
      const query = new URL(request.url ?? "", "http://localhost").searchParams;
      server.ws.send({ type: "custom", event: "kaleidosage:help-shots", data: { only: query.get("only") ?? "" } });
      response.end("The dev app makes the help pictures now. The dev log shows each one.\n");
    });
    server.middlewares.use("/__help-preview", (request, response) => {
      const query = new URL(request.url ?? "", "http://localhost").searchParams;
      server.ws.send({ type: "custom", event: "kaleidosage:help-preview", data: { chapter: query.get("chapter") ?? "", scroll: Number(query.get("scroll")) || 0, zoom: Number(query.get("zoom")) || 1 } });
      response.end("The help window writes public/help/preview.png now.\n");
    });
  }
};

/** Writes the app version into the splash page (splash.html), which has no script. */
const appVersion = {
  name: "kaleidosage-app-version",
  transformIndexHtml: (html: string) => html.replaceAll("%APP_VERSION%", pkg.version)
};

export default defineConfig({
  plugins: [react(), clientLog, appVersion, helpShots],
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
