# Venture-Grid（VG）

> 相互关联的猜想，一同探寻通往远期可行未来的路径

Venture-Grid
人类文明赖以存续的地球宜居环境，并不是永恒的。太阳的恒星演化是十亿年级别、确定不可逆的自然规律。这只是客观的天文事实，不是末日预言，也不是刻意制造恐慌。到今天为止，我们还没有找到一套完整可靠、可以长期承接文明存续的替代方案。

Venture-Grid，就是为了承载这份长远的牵挂而生。我们不想渲染毁灭，只想为这份跨世代的疑问，搭建一个足够耐心、可以持续运转的 AI 守望系统。系统的核心目标，是沿着各式各样的思路持续探索，一点点消解远期宜居生存背后的未知风险。

它是一套微内核结构，依靠一条条叫做 Venture 的探究方向向外延伸。没有预先锁定的标准答案，也不会押注单一出路。每一条探索思路都可以被推演、打分、归档、休眠，等到新证据出现时再重新启动。AI 每周统一完成一轮全局评估、文献追踪与结论更新，所有记录全部公开、可溯源、能够复现。

这是一个松散自治的联盟。每一份独立部署的 fork 节点，都可以自主选择是否和其他节点互相发现、交换探索资料，同步的决定权永远握在节点运维者手上。不存在中心管控，大家自愿互通、互相补充，一起搭建一份可以跨越世代、随时能够被后人接手重启的知识库。

这个项目本身没有强制规定运营方式。运行节点的人，可以选择纯公益运营；也可以适度变现、投放广告，用收益负担服务器、API 和人力开销，只要不篡改系统底层宪章、不扭曲探索的核心目标。任何人都可以提交新的探究方向，补充资料线索，或是捐赠闲置算力与服务器时长，一起支撑这场漫长的探索。

---
<img width="929" height="836" alt="image" src="https://github.com/user-attachments/assets/c7dfaaa7-c9c3-4a53-9c65-947ef288a598" />
<img width="920" height="602" alt="image" src="https://github.com/user-attachments/assets/52091d6a-e987-40a9-95f5-4826338f41ab" />
<img width="889" height="618" alt="image" src="https://github.com/user-attachments/assets/28a69256-e2cb-4b34-9574-babac404e3ef" />
<img width="918" height="901" alt="image" src="https://github.com/user-attachments/assets/1a3bee17-3f1a-4d1c-9987-00fd254618a7" />
<img width="921" height="906" alt="image" src="https://github.com/user-attachments/assets/bb4d2edc-e61c-4147-b3af-48c961b94007" />

## 1. 形态

```
Bun 单进程（默认 5277）
├─ /api/vg/**   业务 API（写操作需 Bearer VG_ADMIN_TOKEN）
├─ /docs/**     运行期文档页（Markdown 渲染）
└─ /*           ui/dist 静态资源 + SPA fallback
      └─ /data/vg.sqlite（WAL）
```

一个容器、一个端口、一个数据卷即可运行。

---

## 2. 快速开始

### 2.1 本地

```bash
cd modules/venture-grid
bun install
bun run seed           # 可选：灌入 6 条演示 Venture（跨两个批次，含 up/flat/down）
bun run ui:build       # 生成 ui/dist
bun run serve          # http://127.0.0.1:5277/
```

写操作需要管理员令牌：

```bash
# PowerShell
$env:VG_ADMIN_TOKEN="change-me"; bun run serve
# bash
VG_ADMIN_TOKEN=change-me bun run serve
```

大模型（**不配置就没有证据摘要与周报**，这是刻意设计）：

```bash
$env:VG_LLM_PROVIDER="deepseek"
$env:VG_LLM_API_KEY="<key>"
$env:VG_LLM_BASE_URL="https://api.deepseek.com/v1"   # 可选
$env:VG_LLM_MODEL="deepseek-v4.1-flash"              # 可选
```

### 2.2 Docker（单包）

```bash
cd modules/venture-grid
cp .env.example .env      # 填 VG_ADMIN_TOKEN / VG_LLM_API_KEY
docker compose up --build # http://127.0.0.1:5277/
```

* 数据在命名卷 `venture-grid-data` 的 `/data/vg.sqlite`
* 镜像约 **330MB**（`oven/bun` slim 基座 + 引擎传递依赖 + 静态资源）
* `docker compose down` 不删数据；`down -v` 才清空
* 健康检查：`GET /api/vg/health`

### 2.3 CLI

```bash
bun run run.ts check
bun run run.ts seed-demo [--force]
bun run run.ts ensure-exoplanet
bun run run.ts run-weekly [--batch <id|current>]
bun run run.ts export --venture <id> [--out x.md]
bun run run.ts export --snapshot [id|all] [--out snap.json]
bun run run.ts import --file snap.json
bun run run.ts backup [--out vg.sqlite]
```

---

## 3. 环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `VG_ADMIN_TOKEN` | 写操作必填 | — | 未配置时所有写接口返回 503，**不默认放行** |
| `VG_DB_PATH` | 否 | `data/vg.sqlite` | SQLite 路径（Docker 内为 `/data/vg.sqlite`） |
| `VG_PORT` / `VG_HOST` | 否 | `5277` / `127.0.0.1` | 监听地址（Docker 镜像内默认 `0.0.0.0`） |
| `VG_INSTANCE_NAME` | 否 | `local` | 写入 `forkOrigin`，便于跨实例追溯 |
| `VG_LLM_PROVIDER` | 否 | `deepseek` | `deepseek` / `openai` / `anthropic` |
| `VG_LLM_API_KEY` | 是（用模型时） | — | 统一密钥；DeepSeek 亦可读 `DEEPSEEK_API_KEY` |
| `VG_LLM_BASE_URL` | 否 | 按 provider | DeepSeek 默认 `https://api.deepseek.com/v1` |
| `VG_LLM_MODEL` | 否 | `deepseek-v4.1-flash` | 换 `deepseek-v4.1` 只需改这里 |
| `VG_LLM_TIMEOUT_MS` | 否 | `60000` | 单次模型调用超时（超时即失败，无重试兜底） |
| `VG_WEEKLY_DAY` / `VG_WEEKLY_AT` | 否 | 关闭 | 进程内每周定时（`1`=周一，`09:00`）。生产更推荐外部 cron |
| `VG_PUBLIC_SUBMIT` | 否 | `1` | `0` = 关闭访客提交 |
| `VG_PUBLIC_BASE_URL` | 否 | `http://127.0.0.1:5277` | 邮件里的站内链接前缀 |
| `VG_EMAIL_PROVIDER` | 否 | 自动推断 | `resend` / `webhook` / `console` |
| `VG_EMAIL_API_KEY` / `VG_EMAIL_FROM` | resend 必填 | — | Resend 密钥与发件人 |
| `VG_EMAIL_WEBHOOK_URL` / `VG_EMAIL_WEBHOOK_TOKEN` | webhook 必填 | — | 自建邮件网关 |

Anthropic 适配器刻意**不读取** `ANTHROPIC_API_KEY`（仓库主控制台常把它设为 `deepseek::<key>` 的代理格式），只认 `VG_LLM_API_KEY` / `ANTHROPIC_LLM_API_KEY`。

---

## 4. 目录

```text
modules/venture-grid/
├─ domain/      纯函数：types / trend / layout / brief / snapshot / validation / week / ids
├─ db/          migrations + database + 13 个 repo
├─ datasource/  exoplanet.ts（NASA TAP 查询与解析）
├─ services/    vg-service（事务与事件）、llm-service、proposal-review（AI 审核）、notification-service（邮件）
├─ email/       types / registry / providers{resend,webhook,console}
├─ llm/         types / errors / http / registry / prompts / providers{deepseek,openai,anthropic}
├─ agent/       weekly-workflow.yaml + weekly-job.ts + scheduler.ts
├─ api/         http.ts + router.ts（/api/vg/**）
├─ ui/          独立 Vite 子工程（React 19 + @xyflow/react + Fuse + marked + xss）
├─ tests/       fixtures/mock-llm.ts + 领域/仓储/接口/agent 单测
├─ serve.ts     单端口静态 + API
├─ run.ts       CLI 入口
├─ Dockerfile / docker-compose.yml / .env.example
└─ data/        运行时 SQLite（gitignore）
```

---

## 5. 数据模型（表）

| 表 | 关键约束 |
|---|---|
| `vg_venture` | `parent_id` 自引用；`status ∈ active/suspended/closed`；`fork_origin` |
| `vg_evidence` | 归属单条 Venture；`abstract_source ∈ llm/admin_edited` |
| `vg_link` | `relation_type ∈ support/contradict/depend/parallel`；`UNIQUE(from,to,type)` |
| `vg_score` | **append-only**（无 UPDATE/DELETE）；`trend` 写入时固化；同一 Venture 同一批次只允许一条 |
| `vg_batch` | 批次名唯一；`brief_status ∈ pending/generating/ready/failed`；`brief_error` |
| `vg_event` | 8 种 kind，只 INSERT；**时间轴 + 周报 + 审计的唯一事实源**；业务写入自动挂当前批次 |
| `vg_document` | 运行期文档（guide/glossary/evidence_source/brief_archive），slug 唯一 |
| `vg_run` | 引擎每次 run 的 status / 耗时统计 |
| `vg_llm_call` | provider/model/purpose/status/error_code/duration/prompt_sha256（不存 prompt 全文） |
| `vg_setting` | 键值设置（预留） |
| `vg_dataset` | 挂在 Venture 上的公开数据源：provider / 筛选配置 / 缓存 / 上次拉取时间 / 错误 |
| `vg_proposal` | 访客提案：标题/正文/线索/署名/邮箱/状态（pending/accepted/rejected）/审核备注/审核者（ai）/生成的 Venture |
| `vg_email_log` | 提案审核通知的发送记录：收件人/主题/状态（sent/failed）/provider/错误/时间 |

访客提案流程（`/submit`）：

* 公开提交，无需登录；只进审核队列，**不直接写入图谱**
* 填写**通知邮箱**；每周 agent 任务里由大模型审核，采纳/拒绝都会自动发邮件
* 采纳时自动生成 Venture（根节点，AI 可补充标签）；拒绝保留理由
* 管理端只做只读查看（提案、AI 理由、邮件发送记录），**不提供人工采纳/拒绝入口**
* 限流 3 次/小时/IP + 蜜罐字段；`VG_PUBLIC_SUBMIT=0` 可整体关闭
* 正文至少 20 字，避免一句话灌水

邮件服务（无降级）：

| provider | 必需环境变量 | 说明 |
|---|---|---|
| `resend` | `VG_EMAIL_API_KEY` + `VG_EMAIL_FROM` | Resend HTTP API |
| `webhook` | `VG_EMAIL_WEBHOOK_URL`（可选 `VG_EMAIL_WEBHOOK_TOKEN`） | POST `{to, subject, text}` 到你自己的邮件网关 |
| `console` | 无 | 仅开发用，邮件打印到 stdout |

未配置时：审核照常进行，但邮件发送失败会写入 `vg_email_log` 并在管理端显示「发送失败」。

公开数据源（NASA Exoplanet Archive）：

* 数据表：`datasource/exoplanet.ts`（TAP/ADQL，`pscomppars` 合并表，一行一行星）
* 筛选：半径 ≤ `maxRadius` R⊕、平衡温度 `tempMin–tempMax` K、条数上限，默认 2 R⊕ / 200–320 K / 40 条
* 缓存：6h TTL；过期或管理员点「刷新」才出网；失败保留旧缓存并标 `stale`，无缓存时返回空表 + 错误，**不伪造数据**
* 幂等挂载：同一 Venture + 同一 provider 只有一条；`bun run run.ts ensure-exoplanet` 可为既有库补挂「寻找可用行星」初始大分支

不变量：

* 打分必须带非空评审意见；`evidence_refs` 允许为空但 UI 标黄提示
* 证据引用必须属于同一条 Venture
* 证据摘要必须由模型生成；模型失败 → **证据不落库**
* 周报四类事件由程序聚合，模型只写「本周综述」段落

---

## 6. API

读（公开）：

```
GET  /api/vg/health
GET  /api/vg/state
GET  /api/vg/ventures?status=&tag=&batch=
GET  /api/vg/ventures/:id           → 详情（含证据/分数/关联/父子）
GET  /api/vg/ventures/:id/datasets  → 公开数据（缓存过期自动拉取；force=1 需管理员）
POST /api/vg/ventures/:id/datasets/:datasetId/refresh  （需令牌，强制刷新）
GET  /api/vg/graph                  → 布局好的节点 + 边
GET  /api/vg/timeline?from=&to=&limit=
GET  /api/vg/search-index           → 供 Fuse 客户端建索引
GET  /api/vg/batches | /batches/:id | /batches/:id/brief
GET  /api/vg/documents | /documents/:slug
GET  /api/vg/runs | /llm-calls
GET  /api/vg/export/venture/:id.md
GET  /api/vg/export/snapshot/all.json
GET  /api/vg/backup                 （需令牌，SQLite 文件）
GET  /api/vg/admin/check            （需令牌，UI 校验用）
```

写（`Authorization: Bearer $VG_ADMIN_TOKEN`）：

```
POST/PATCH /api/vg/ventures           POST /api/vg/ventures/:id/fork
POST       /api/vg/ventures/:id/evidences   ← 先调模型；失败 503/5xx 且不落库
POST       /api/vg/ventures/:id/scores      ← 同批次重复打分 409
POST       /api/vg/links
POST/PATCH /api/vg/batches            POST /api/vg/batches/:id/close
POST       /api/vg/batches/:id/brief  ← 失败返回 502 且批次标 failed
POST       /api/vg/snapshots/import
POST/PATCH /api/vg/documents
POST       /api/vg/proposals                （公开：访客提案，限流 3/小时/IP）
GET        /api/vg/proposals                （需令牌；含 emailLogs）
```

错误统一体：`{ ok:false, code, error, detail? }`；HTTP 状态：422 校验 / 401 令牌 / 409 冲突 / 502–504 模型或周报失败。

---

## 7. 大模型适配器（无降级）

```
llm/
├─ types.ts        LlmProvider / LlmRequest / LlmReply / Env
├─ errors.ts       7 类错误 → HTTP 状态映射
├─ http.ts         60s AbortController、状态码分类、JSON 解析
├─ providers/deepseek.ts    OpenAI 兼容，默认 deepseek-v4.1-flash
├─ providers/openai.ts      同协议
├─ providers/anthropic.ts   Messages API（独立字段）
├─ prompts.ts      证据摘要 / 周报综述两类提示词
└─ registry.ts     按 VG_LLM_PROVIDER 选择；未配置抛 not_configured
```

硬规则：

1. **未配置、鉴权失败、限流、超时、空响应都抛错**，不返回占位文本。
2. 证据摘要失败 → 502/503，**证据不落库**；UI 保留输入可重试。
3. 周报失败 → 批次 `failed` + `brief_error`，`brief_content` 清空；UI 显示「本周暂无周报：<原因>」。
4. 每次调用落 `vg_llm_call`（含错误码与耗时），便于审计。

---

## 8. 每周 agent

```yaml
# agent/weekly-workflow.yaml
collect → compose → finalize
```

* 用仓库 L0 引擎 `@gobing-ai/ts-dual-workflow-engine@0.4.66`（npm 依赖，安装进镜像）
* VG 自己写约 120 行 `ActionRunner` 接线，**不复制** `modules/agent-factory` 的 entry/actions/YAML
* **不引入** `multi-agent-bus`：周报是单线流程，无消息路由；其 `claude-code-agent.ts` 会 spawn CLI 子进程，只会让镜像变重
* 触发：`POST /api/vg/batches/:id/brief`、`run.ts run-weekly`、或可选的 `VG_WEEKLY_DAY/AT` 进程内定时
* 提案审核也在同一条 run 里：**review（AI 审核提案 + 发邮件）** → collect → compose → finalize；审核失败不阻塞周报

失败语义：任一步失败 → 整条 run `failed` → 批次 `failed`，不产生半成品周报。

---

## 9. 前端

* **管理员登录门禁**：未验证时导航栏不显示「管理」，`/admin` 只渲染登录表单（输入 `VG_ADMIN_TOKEN`，经 `/api/vg/admin/check` 验证后才进入控制台）；所有写操作入口（编辑/打分/添加证据/建立关联/Fork/生成周报/保存综述/文档管理/快照导入/备份）对匿名用户隐藏，只保留只读浏览与导出。令牌失效会在启动时自动清除。**UI 门禁不是安全边界**，服务端仍对每个写接口校验令牌。
* **访客提案入口**：导航「提交」+ 首页 CTA → `/submit`，公开填写；提交后进入管理端审核队列，采纳才生成 Venture。
* 路由：`/` `/graph` `/venture/:id` `/timeline` `/brief` `/search` `/docs` `/docs/:slug` `/about` `/admin`
* 图谱：左→右时序；同层用重心排序减少交叉；**线宽 = 1 + 子树体量**（主干明显粗于细枝）；**点击连线**就地显示关系文字与备注；末端虚线收敛到目标锚，锚点写明「最终不适宜环境下的文明存续」（仅方向参照）
* 搜索：`/api/vg/search-index` → Fuse 客户端索引（标题/摘要/证据摘要/标签/文档正文），**不查数据库**
* i18n：`ui/src/i18n/{zh,en}.json` 只覆盖 UI 文案；**用户录入内容永不经过 i18n**
* 文档：`marked` + `xss` 消毒；`vg://venture/<id>` 内部链接
* 公开数据：Venture 详情页的「公开数据」区块直接展示 NASA Exoplanet Archive 候选行星与宿主恒星参数；管理员可「刷新」，匿名只读
* 图谱导出：JSON（PNG 需要额外依赖 `html-to-image`，当前版本未引入）

---

## 10. 门禁与测试

```bash
cd modules/venture-grid
bun run typecheck      # 服务端
bun run ui:typecheck   # 前端
bun test tests         # 单测
bun run check          # 三者串联
```

* **未修改仓库根 `package.json` / `tsconfig.multi-agent.json` / `bun.lock` / `tests/`**
* 根 `bun run check` 不包含 VG；VG 的门禁就是模块内这条 `bun run check`
* `tests/fixtures/mock-llm.ts` 是本地假模型（OpenAI 兼容），用于无 key 环境下验证全链路

---

## 11. 已知限制（刻意保留）

| 项 | 说明 |
|---|---|
| 单管理员 | 无用户表/角色/会话；只有一道 `VG_ADMIN_TOKEN` 写闸 |
| Fork 非实时 | 跨实例只靠快照导出/导入，不做集群同步 |
| 图谱 PNG | 当前只导出 JSON；PNG 需引入 `html-to-image` |
| Fuse 索引 | 客户端内存索引，适合中长期规模（数千条），不做十万级 |
| 公开数据源 | 只接 NASA Exoplanet Archive；容器需要出网才能拉取（失败会保留旧缓存并标 stale） |
| 访客提案 | 审核由每周 AI 完成；管理端只读。邮件发送依赖外部 provider，未配置时只记录失败 |
| 模型综述 | 由模型生成，可能与数据细节存在偏差；UI 明确标注「以程序聚合为准」 |

---

## 12. PRD §9 验收映射

| PRD 验收点 | 落点 |
|---|---|
| 术语一致性 | `ui/src/i18n/{zh,en}.json` + `about` 页 + 代码层 `vg`/`venture` 命名空间 |
| i18n 边界 | 数据字段不经过 `t()`；切换语言只影响 UI |
| 图谱形态 | `domain/layout.ts`（深度/同层/目标锚）+ `GraphCanvas` |
| 趋势三态 | `domain/trend.ts` + `vg_score.trend` 固化 + 跨批次对比（`ScoreRepo.previousBefore`） |
| 周报四类事件 | `domain/brief.ts` + `vg_event` 批次归属 + 单测 |
| 快照 Fork | `domain/snapshot.ts`（id 重写 / forkOrigin / 关联重建）+ 导入 API |
| 审计链路 | `vg_score` append-only + `vg_event` + `vg_llm_call` |
