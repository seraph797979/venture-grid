#!/usr/bin/env bun
// modules/venture-grid/serve.ts
/**
 * 单进程、单端口同时提供：
 *   /api/vg/**  → 业务 API
 *   /*          → ui/dist 静态资源（非资源路径回退 index.html）
 * 这样打包时只需要一个容器 + 一个端口。
 */
import path from "node:path";
import { openDatabase } from "./db/database";
import { handleApi, isApiPath, isAssetPath } from "./api/router";
import { VgService } from "./services/vg-service";
import { parseWeeklySchedule, startWeeklyScheduler } from "./agent/scheduler";

export const MODULE_ROOT = path.resolve(import.meta.dir);
export const UI_DIST = path.join(MODULE_ROOT, "ui", "dist");
export const DEFAULT_PORT = 5277;
export const DEFAULT_HOST = "127.0.0.1";

export type ServeOptions = {
  port?: number;
  host?: string;
  dbPath?: string;
  /** 测试可注入；默认真实 UI 目录 */
  uiDist?: string;
};

function htmlHint(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Venture-Grid</title>
     <body style="font-family:system-ui;padding:40px;line-height:1.6">
     <h1>Venture-Grid</h1><p>${message}</p>
     <pre>cd modules/venture-grid/ui &amp;&amp; bun install &amp;&amp; bun run build</pre>
     <p>或使用 <code>bun run ui:build</code>。</p></body>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export function createFetchHandler(service: VgService, uiDist: string = UI_DIST) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (isApiPath(url.pathname)) {
      return handleApi(request, service);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const decoded = decodeURIComponent(url.pathname);
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const candidate = path.resolve(uiDist, relative);
    const inside = candidate === path.resolve(uiDist) || candidate.startsWith(`${path.resolve(uiDist)}${path.sep}`);

    if (inside) {
      const file = Bun.file(candidate);
      if (await file.exists()) {
        const headers: Record<string, string> = { "Content-Type": file.type || "application/octet-stream" };
        // Vite 产物带哈希，可长缓存；index.html 不缓存
        headers["Cache-Control"] = relative.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "no-store";
        return new Response(file, { status: 200, headers });
      }
    }

    if (!isAssetPath(decoded)) {
      const indexFile = Bun.file(path.join(uiDist, "index.html"));
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    }

    const distExists = await Bun.file(path.join(uiDist, "index.html")).exists();
    if (!distExists) return htmlHint("前端产物不存在（ui/dist 未构建）。");
    return new Response("Not Found", { status: 404 });
  };
}

export function startServer(options: ServeOptions = {}) {
  const db = openDatabase({ dbPath: options.dbPath });
  const service = new VgService({ db });
  const port = options.port ?? (Number.parseInt(process.env.VG_PORT ?? "", 10) || DEFAULT_PORT);
  const host = options.host ?? (process.env.VG_HOST ?? DEFAULT_HOST);

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: createFetchHandler(service, options.uiDist ?? UI_DIST),
  });

  const schedule = parseWeeklySchedule();
  const stopScheduler =
    schedule === null
      ? null
      : startWeeklyScheduler({
          service,
          day: schedule.day,
          at: schedule.at,
          onResult: (result) => {
            console.log(
              `[vg] weekly brief ${result.status} batch=${result.batchId}${result.error ? ` error=${result.error}` : ""}`,
            );
          },
          onError: (error) => console.error("[vg] weekly scheduler error", error),
        });

  return {
    server,
    service,
    db,
    port: server.port,
    host,
    url: `http://${host}:${server.port}/`,
    stop: () => {
      stopScheduler?.();
      server.stop(true);
      db.close();
    },
  };
}

if (import.meta.main) {
  const app = startServer();
  console.log(`[vg] Venture-Grid listening on ${app.url}`);
  console.log(`[vg] SQLite: ${app.service.state().instance} · ventures=${app.service.ventures.count()}`);
  const shutdown = () => {
    app.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}