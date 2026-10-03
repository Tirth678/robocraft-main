import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Private admin console.
 *
 * Served only behind staff authentication — never published to a CDN or a
 * public static host. Every `/admin-api` call is proxied to admin-service, so
 * the browser never holds a bearer token: authority lives in an httpOnly
 * session cookie that only admin-service can mint.
 */
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8082,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/admin-api": {
        target: "http://127.0.0.1:3007",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/admin-api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "terser",
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));