import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Tauri は固定ポートを前提にするため strictPort を有効にする。
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },

  // Tauri CLI 側の出力を消さない
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // Rust 側の変更で Vite が再読み込みしないようにする
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    // Windows の WebView2 が対応するターゲット
    target: "chrome105",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
