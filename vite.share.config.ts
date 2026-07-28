import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "share"),
  base: "./",
  publicDir: resolve(__dirname, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
  build: {
    outDir: resolve(__dirname, "share-dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
