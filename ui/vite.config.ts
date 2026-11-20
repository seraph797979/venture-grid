import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * VG 前端：产物由 serve.ts 挂在同源根路径下，因此 base 用相对路径。
 * dev 端口 5278（避开 5277 后端与 5273/5275/5276 其他模块），
 * /api/vg 代理到已启动的后端，dev 模式也能真实读写。
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5278,
    proxy: { "/api/vg": "http://127.0.0.1:5277" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});