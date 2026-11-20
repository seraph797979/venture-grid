#!/usr/bin/env bun
// modules/venture-grid/run.ts
/**
 * 模块自有入口（不依赖根目录脚本 / 根门禁）。
 *   bun run run.ts serve [--port 5277] [--host 127.0.0.1]
 *   bun run run.ts check
 *   bun run run.ts seed-demo [--force]
 *   bun run run.ts run-weekly [--batch <id|current>]
 *   bun run run.ts export --venture <id> | --snapshot [id|all] [--out <file>]
 *   bun run run.ts import --file <snapshot.json>
 *   bun run run.ts backup [--out <file>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openDatabase, tableCount, tableNames } from "./db/database";
import { VgService } from "./services/vg-service";
import { describeLlm } from "./llm/registry";
import { isoWeekInfo } from "./domain/week";
import type { Venture } from "./domain/types";
import { runWeeklyJob } from "./agent/weekly-job";
import { startServer } from "./serve";
import { ServiceError } from "./services/vg-service";

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return value === undefined ? null : value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function printHelp(): void {
  console.log(
    [
      "Venture-Grid CLI",
      "",
      "  serve [--port 5277] [--host 127.0.0.1]",
      "  check",
      "  seed-demo [--force]",
      "  ensure-exoplanet",
      "  run-weekly [--batch <id|current>]",
      "  export --venture <id> | --snapshot [id|all] [--out <file>]",
      "  import --file <snapshot.json>",
      "  backup [--out <file>]",
      "",
      "环境变量：VG_DB_PATH / VG_ADMIN_TOKEN / VG_LLM_PROVIDER / VG_LLM_API_KEY",
      "         DEEPSEEK_API_KEY / DEEPSEEK_MODEL / VG_INSTANCE_NAME",
    ].join("\n"),
  );
}

function openService(dbPath?: string): { service: VgService; close: () => void } {
  const db = openDatabase({ dbPath });
  const service = new VgService({ db });
  return { service, close: () => db.close() };
}

async function commandCheck(): Promise<number> {
  const db = openDatabase();
  const service = new VgService({ db });
  const expected = [
    "vg_venture",
    "vg_evidence",
    "vg_link",
    "vg_score",
    "vg_batch",
    "vg_event",
    "vg_document",
    "vg_run",
    "vg_llm_call",
    "vg_setting",
    "vg_dataset",
    "vg_proposal",
    "vg_email_log",
  ];
  const existing = new Set(tableNames(db));
  const missing = expected.filter((name) => !existing.has(name));
  for (const name of expected) {
    console.log(`  ${name.padEnd(14)} ${tableCount(db, name)}`);
  }
  const state = service.state();
  console.log(
    `ventures=${state.counts.total} active=${state.counts.active} suspended=${state.counts.suspended} closed=${state.counts.closed}`,
  );
  console.log(`events=${state.eventCount} documents=${state.documentCount} batches=${state.batchCount}`);
  const llm = state.llm;
  console.log(`llm.configured=${llm.configured} provider=${llm.provider ?? "-"} model=${llm.model ?? "-"}`);
  console.log(`llm.hint=${llm.hint}`);
  db.close();
  if (missing.length > 0) {
    console.error(`缺少表：${missing.join(", ")}`);
    return 1;
  }
  return 0;
}

export const EXOPLANET_TITLE = "寻找可用行星（恒星—行星系统）";

/**
 * 「寻找可用行星」初始大分支：宿主恒星 + 行星两条子分支，并挂 NASA 公开数据源。
 * 幂等：已存在就只确保数据源挂上。
 */
function ensureExoplanetBranch(service: VgService): { venture: Venture; created: boolean } {
  const existing = service.ventures.list().find((venture) => venture.title === EXOPLANET_TITLE);
  if (existing !== undefined) {
    service.datasets.attach(existing.id, {
      label: "NASA Exoplanet Archive · 类地候选",
      config: { maxRadius: 2, tempMin: 200, tempMax: 320, limit: 40 },
    });
    return { venture: existing, created: false };
  }

  const hunt = service.createVenture({
    title: EXOPLANET_TITLE,
    summary: "把「可长期承接文明的落脚点」拆成宿主恒星与行星两条判据。",
    hypothesis:
      "恒星决定能量供给与时间窗口，行星决定温控与物质条件。先用公开的系外行星数据建立可复核的候选清单，再逐条补充证据，而不是先押注单一路线。",
    tags: ["exoplanet", "star", "habitability"],
  });

  const star = service.createVenture({
    title: "宿主恒星筛选",
    parentId: hunt.id,
    summary: "先选恒星，再谈行星。",
    hypothesis:
      "优先选择长期稳定、辐射条件可接受的主序星；红矮星寿命长，但耀斑与潮汐锁定风险需要单独评估。",
    tags: ["star", "stellar-evolution"],
  });

  const planet = service.createVenture({
    title: "行星宜居判据",
    parentId: hunt.id,
    summary: "半径、温度与大气保留能力。",
    hypothesis:
      "在恒星宜居带内，行星半径与大气保留能力是首要筛选条件；平衡温度只是代理指标，不能替代真实大气模型。",
    tags: ["planet", "habitable-zone"],
  });

  service.addLink({
    fromVentureId: star.id,
    toVentureId: hunt.id,
    relationType: "support",
    note: "恒星寿命与辐射条件决定可用的时间窗口",
  });
  service.addLink({
    fromVentureId: planet.id,
    toVentureId: star.id,
    relationType: "depend",
    note: "行星判据依赖宿主恒星的类型与演化阶段",
  });

  service.datasets.attach(hunt.id, {
    label: "NASA Exoplanet Archive · 类地候选",
    config: { maxRadius: 2, tempMin: 200, tempMax: 320, limit: 40 },
  });

  return { venture: hunt, created: true };
}

function seedDemo(force: boolean): number {
  const { service, close } = openService();
  try {
    if (service.ventures.count() > 0 && !force) {
      console.log(`[seed] 已有 ${service.ventures.count()} 条 Venture，跳过（--force 可重跑）`);
      return 0;
    }
    const current = service.ensureCurrentBatch();
    // 演示数据跨两个批次，便于真实呈现 up / flat / down 三种趋势
    const previousWeek = isoWeekInfo(new Date(Date.now() - 7 * 86_400_000));
    const previousBatch =
      service.batches.getByName(previousWeek.name) ??
      service.createBatch({
        name: previousWeek.name,
        startTime: previousWeek.startIso,
        endTime: previousWeek.endIso,
      });
    ensureExoplanetBranch(service);
    const root = service.createVenture({
      title: "轨道级能源自给",
      summary: "以在轨能源自给作为远期可行性的第一道门槛。",
      hypothesis: "若轨道设施能在不依赖地面补给的前提下维持能源正平衡，则长期驻留的边际成本会持续下降。",
      tags: ["energy", "orbit"],
    });
    const storage = service.createVenture({
      title: "闭环物质循环",
      summary: "物质闭环比能源自给更难，但决定驻留规模上限。",
      hypothesis: "关键元素（C/H/O/N）的回收率若长期稳定在 95% 以上，驻留规模可脱离补给频率约束。",
      parentId: root.id,
      tags: ["closed-loop"],
    });
    const hab = service.createVenture({
      title: "低重力生理适应",
      summary: "生理适应是人力可持续性的隐性约束。",
      hypothesis: "在 0.3–0.6g 区间的长期暴露可能保留足够的肌骨功能，但证据仍然稀疏。",
      parentId: root.id,
      tags: ["biology"],
    });
    service.createVenture({
      title: "辐射屏蔽材料",
      summary: "屏蔽质量与发射成本之间存在硬约束。",
      hypothesis: "以原位材料为主的复合屏蔽，可能把长期剂量压到可接受区间。",
      parentId: storage.id,
      tags: ["materials"],
    });
    service.createVenture({
      title: "自治制造链",
      summary: "把备件供应链缩到本地。",
      hypothesis: "增材制造 + 本地原料提纯可以覆盖 60% 以上的备件需求。",
      parentId: storage.id,
      tags: ["manufacturing"],
    });
    service.createVenture({
      title: "社会契约与治理",
      summary: "小规模驻留的治理成本常被低估。",
      hypothesis: "低人数、长周期场景更依赖预先约定的冲突解决机制。",
      tags: ["governance"],
    });

    const ev1 = service.addEvidence(root.id, {
      sourceTitle: "Orbital energy balance review (demo)",
      abstract: "样例数据：在日照占比 65% 的轨道上，能源正平衡依赖储能质量与散热效率的同步优化。",
      tags: ["energy"],
      abstractSource: "admin_edited",
    });
    const ev2 = service.addEvidence(storage.id, {
      sourceTitle: "Closed-loop recycling rates (demo)",
      abstract: "样例数据：现有地面闭环系统的关键元素回收率介于 78%–93%，长期稳定性仍缺现场验证。",
      tags: ["closed-loop"],
      abstractSource: "admin_edited",
    });
    service.addEvidence(hab.id, {
      sourceTitle: "Partial gravity physiology (demo)",
      abstract: "样例数据：部分重力下的骨密度变化呈非线性，个体差异大于重力区间差异。",
      tags: ["biology"],
      abstractSource: "admin_edited",
    });
    service.addEvidence(root.id, {
      sourceTitle: "Launch cost trend (demo)",
      abstract: "样例数据：单位质量入轨成本仍在缓慢下降，但对长期驻留的总成本影响有限。",
      tags: ["cost"],
      abstractSource: "admin_edited",
    });

    service.addScore(root.id, {
      score: 62,
      comment: "上批样例评审：方向成立，但储能质量仍是瓶颈。",
      evidenceRefs: [ev1.id],
      batchId: previousBatch.id,
    });
    service.addScore(storage.id, {
      score: 44,
      comment: "上批样例评审：回收率数据不足。",
      batchId: previousBatch.id,
    });
    service.addScore(hab.id, {
      score: 39,
      comment: "上批样例评审：证据稀疏。",
      batchId: previousBatch.id,
    });
    service.addScore(storage.id, {
      score: 48,
      comment: "样例评审：回收率数据不足以支撑 95% 的假设。",
      evidenceRefs: [ev2.id],
      batchId: current.id,
    });
    service.addScore(hab.id, {
      score: 36,
      comment: "样例评审：新增证据偏弱，判断小幅下调。",
      batchId: current.id,
    });
    service.addScore(root.id, {
      score: 66,
      comment: "样例评审：补充发射成本证据后小幅上调。",
      evidenceRefs: [ev1.id],
      batchId: current.id,
    });

    service.addLink({
      fromVentureId: storage.id,
      toVentureId: hab.id,
      relationType: "depend",
      note: "物质闭环影响生理适应的可持续性",
    });
    service.addLink({
      fromVentureId: root.id,
      toVentureId: storage.id,
      relationType: "depend",
      note: "能源门槛先于物质闭环",
    });
    service.addLink({
      fromVentureId: hab.id,
      toVentureId: root.id,
      relationType: "support",
      note: "人力可持续性反过来支撑能源路线",
    });
    service.addLink({
      fromVentureId: storage.id,
      toVentureId: root.id,
      relationType: "support",
      note: "闭环降低地面补给依赖",
    });

    service.createDocument({
      slug: "guide",
      title: "使用说明",
      kind: "guide",
      bodyMd: "# 使用说明\n\n- 新建 Venture → 添加证据（自动生成摘要）→ 打分 → 建立关联\n- 每周批次结束后生成简报；没有大模型时不会产出周报\n- 快照用于跨实例 Fork 接力\n",
    });
    service.createDocument({
      slug: "glossary",
      title: "术语说明",
      kind: "glossary",
      bodyMd: "# 术语\n\n**VG / Venture-Grid**：承载、评估、关联猜想的结构化体系。\n\n**Venture**：VG 内一条独立猜想分支，最小评估单元。\n\n**Batch**：评审批次，通常按周组织。\n\n**Snapshot**：用于 Fork 接力的导出包。\n\n**Target Anchor**：图谱视觉终点，仅作方向参照。\n",
    });

    console.log(`[seed] 完成：ventures=${service.ventures.count()} events=${service.state().eventCount} batch=${current.name}`);
    return 0;
  } finally {
    close();
  }
}

async function commandRunWeekly(batchArg: string | null): Promise<number> {
  const { service, close } = openService();
  try {
    const batchId =
      batchArg === null || batchArg === "current" ? service.ensureCurrentBatch().id : batchArg;
    const result = await runWeeklyJob(service, { batchId });
    if (result.status === "success") {
      console.log(`[weekly] success run=${result.runId} chars=${result.content?.length ?? 0}`);
      return 0;
    }
    console.error(`[weekly] failed run=${result.runId}: ${result.error ?? "unknown"}`);
    return 1;
  } catch (error) {
    if (error instanceof ServiceError) console.error(`[weekly] ${error.code}: ${error.message}`);
    else console.error("[weekly]", error);
    return 1;
  } finally {
    close();
  }
}

function commandExport(args: string[]): number {
  const { service, close } = openService();
  try {
    const ventureId = argValue(args, "--venture");
    const snapshotArg = hasFlag(args, "--snapshot") ? (argValue(args, "--snapshot") ?? "all") : null;
    const out = argValue(args, "--out");
    if (ventureId !== null) {
      const markdown = service.exportVentureMarkdown(ventureId);
      if (out !== null) {
        writeFileSync(path.resolve(out), markdown, "utf8");
        console.log(`[export] venture ${ventureId} → ${out}`);
      } else {
        process.stdout.write(markdown);
      }
      return 0;
    }
    if (snapshotArg !== null) {
      const snapshot =
        snapshotArg === "all"
          ? service.exportSnapshot()
          : service.exportSnapshot({ ventureIds: [snapshotArg] });
      const text = JSON.stringify(snapshot, null, 2);
      const target = out ?? `vg-snapshot-${snapshot.snapshotId}.json`;
      writeFileSync(path.resolve(target), text, "utf8");
      console.log(`[export] snapshot ${snapshot.snapshotId} → ${target}`);
      return 0;
    }
    printHelp();
    return 1;
  } finally {
    close();
  }
}

function commandImport(args: string[]): number {
  const file = argValue(args, "--file");
  if (file === null) {
    console.error("缺少 --file <snapshot.json>");
    return 1;
  }
  const raw = JSON.parse(readFileSync(path.resolve(file), "utf8")) as unknown;
  const { service, close } = openService();
  try {
    const result = service.importSnapshot(raw);
    console.log(`[import] forkOrigin=${result.forkOrigin}`);
    console.log(`[import] ${JSON.stringify(result.counts)}`);
    for (const warning of result.warnings) console.warn(`[import] warn: ${warning}`);
    return 0;
  } finally {
    close();
  }
}

function commandBackup(args: string[]): number {
  const { service, close } = openService();
  try {
    const bytes = service.backupBytes();
    const target = argValue(args, "--out") ?? `vg-backup-${Date.now()}.sqlite`;
    writeFileSync(path.resolve(target), bytes);
    console.log(`[backup] ${target} (${bytes.byteLength} bytes)`);
    return 0;
  } finally {
    close();
  }
}

async function main(): Promise<number> {
  const [, , command = "help", ...args] = process.argv;
  switch (command) {
    case "serve": {
      const portRaw = argValue(args, "--port");
      const port = portRaw === null ? undefined : Number.parseInt(portRaw, 10);
      const host = argValue(args, "--host") ?? undefined;
      const app = startServer({ ...(port === undefined ? {} : { port }), ...(host === undefined ? {} : { host }) });
      console.log(`[vg] listening ${app.url}`);
      console.log(`[vg] llm: ${JSON.stringify(describeLlm())}`);
      const shutdown = () => {
        app.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      return 0;
    }
    case "check":
      return commandCheck();
    case "seed-demo":
      return seedDemo(hasFlag(args, "--force"));
    case "ensure-exoplanet": {
      const { service, close } = openService();
      try {
        const result = ensureExoplanetBranch(service);
        console.log(
          `[exoplanet] ${result.created ? "已创建" : "已存在"}：${result.venture.title} (${result.venture.id})`,
        );
        console.log("[exoplanet] 数据源已挂载；用管理员在详情页点「刷新」或调 API 拉取。");
        return 0;
      } finally {
        close();
      }
    }
    case "run-weekly":
      return commandRunWeekly(argValue(args, "--batch"));
    case "export":
      return commandExport(args);
    case "import":
      return commandImport(args);
    case "backup":
      return commandBackup(args);
    case "help":
    default:
      printHelp();
      return command === "help" ? 0 : 1;
  }
}

const code = await main();
if (code !== 0) process.exit(code);