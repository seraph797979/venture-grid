# syntax=docker/dockerfile:1
#
# Venture-Grid 单包镜像：一个容器、一个端口（5277）、一个 /data 卷。
# 构建上下文 = modules/venture-grid（不依赖也不复制仓库根目录的 agent 代码，
# 只把 @gobing-ai/ts-dual-workflow-engine 以 npm 依赖装进镜像）。

# ---------- 1) 生产依赖（server 侧只有引擎 & 其传递依赖） ----------
FROM oven/bun:1.4.0 AS deps
WORKDIR /app
COPY package.json ./
RUN bun install --production

# ---------- 2) 前端构建（需要 vite / react 等 dev 依赖） ----------
FROM oven/bun:1.4.0 AS ui-build
WORKDIR /app
COPY package.json ./
RUN bun install
COPY ui ./ui
RUN bun x vite build ui

# ---------- 3) 运行时 ----------
FROM oven/bun:1.4.0-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    VG_HOST=0.0.0.0 \
    VG_PORT=5277 \
    VG_DB_PATH=/data/vg.sqlite \
    VG_INSTANCE_NAME=docker

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# 注意：COPY 多个目录到 "./" 复制的是目录内容，不是目录本身；必须逐个显式给出目标
COPY domain ./domain
COPY db ./db
COPY datasource ./datasource
COPY services ./services
COPY llm ./llm
COPY email ./email
COPY agent ./agent
COPY api ./api
COPY serve.ts ./
COPY run.ts ./
COPY --from=ui-build /app/ui/dist ./ui/dist

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 5277

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:5277/api/vg/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "run", "serve.ts", "serve"]