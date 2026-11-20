// modules/venture-grid/domain/brief.ts
/**
 * 周报聚合与渲染。
 * 事实源是 vg_event（只 INSERT）：四类事件必须一一对上，不允许“静默省略”。
 */
import type {
  Batch,
  BriefData,
  BriefEvidenceItem,
  BriefLinkItem,
  BriefScoreChange,
  Evidence,
  ScoreRecord,
  Venture,
  VentureLink,
  VgEvent,
} from "./types";

export type AssembleBriefParams = {
  batch: Batch;
  ventures: Venture[];
  events: VgEvent[];
  /** 本批次的所有打分记录 */
  scores: ScoreRecord[];
  /** ventureId → 上一批次分数（没有则为 undefined） */
  previousScores: Map<string, number>;
  evidences: Evidence[];
  links: VentureLink[];
};

const EMPTY = "（无）";

function byTime(a: VgEvent, b: VgEvent): number {
  return a.at.localeCompare(b.at);
}

export function assembleBriefData(params: AssembleBriefParams): BriefData {
  const { batch, ventures, events, scores, previousScores, evidences, links } = params;
  const ventureById = new Map(ventures.map((venture) => [venture.id, venture]));
  const evidenceById = new Map(evidences.map((evidence) => [evidence.id, evidence]));
  const linkById = new Map(links.map((link) => [link.id, link]));

  const added = events
    .filter((event) => event.kind === "venture_added")
    .sort(byTime)
    .map((event) => ventureById.get(event.ventureId ?? ""))
    .filter((venture): venture is Venture => venture !== undefined)
    .map((venture) => ({
      id: venture.id,
      title: venture.title,
      status: venture.status,
      parentId: venture.parentId,
    }));

  const scoreChanges: BriefScoreChange[] = scores
    .map((record) => {
      const venture = ventureById.get(record.ventureId);
      return {
        ventureId: record.ventureId,
        title: venture?.title ?? record.ventureId,
        previousScore: previousScores.get(record.ventureId) ?? null,
        score: record.score,
        trend: record.trend,
        comment: record.comment,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const briefEvidences: BriefEvidenceItem[] = events
    .filter((event) => event.kind === "evidence_added")
    .sort(byTime)
    .map((event) => {
      const evidenceId = typeof event.payload.evidenceId === "string" ? event.payload.evidenceId : "";
      return evidenceById.get(evidenceId);
    })
    .filter((evidence): evidence is Evidence => evidence !== undefined)
    .map((evidence) => ({
      id: evidence.id,
      ventureId: evidence.ventureId,
      ventureTitle: ventureById.get(evidence.ventureId)?.title ?? evidence.ventureId,
      sourceTitle: evidence.sourceTitle,
      abstract: evidence.abstract,
    }));

  const briefLinks: BriefLinkItem[] = events
    .filter((event) => event.kind === "link_added")
    .sort(byTime)
    .map((event) => {
      const linkId = typeof event.payload.linkId === "string" ? event.payload.linkId : "";
      return linkById.get(linkId);
    })
    .filter((link): link is VentureLink => link !== undefined)
    .map((link) => ({
      id: link.id,
      fromId: link.fromVentureId,
      fromTitle: ventureById.get(link.fromVentureId)?.title ?? link.fromVentureId,
      toId: link.toVentureId,
      toTitle: ventureById.get(link.toVentureId)?.title ?? link.toVentureId,
      relationType: link.relationType,
      note: link.note,
    }));

  return { batch, added, scoreChanges, evidences: briefEvidences, links: briefLinks };
}

export const TREND_MARK: Record<"up" | "flat" | "down", string> = {
  up: "↑",
  flat: "→",
  down: "↓",
};

function day(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 渲染 Markdown 周报（PRD 模板）。空段落写「（无）」，保证四类事件可见、不误导。
 * 仅由服务端在生成成功后调用；LLM 失败时不会走到这里。
 */
export function renderBriefMarkdown(data: BriefData, options: { narrative?: string } = {}): string {
  const { batch } = data;
  const lines: string[] = [];
  lines.push(`# Venture-Grid 周报 — ${batch.name}`, "");
  lines.push(`周期：${day(batch.startTime)} — ${day(batch.endTime)}`, "");

  lines.push("## 本周新增");
  if (data.added.length === 0) lines.push(EMPTY);
  else {
    for (const item of data.added) {
      const parent = item.parentId ? `父分支：${item.parentId}` : "根节点";
      lines.push(`- ${item.title} / ${item.status} / ${parent}`);
    }
  }
  lines.push("");

  lines.push("## 分数变动");
  if (data.scoreChanges.length === 0) lines.push(EMPTY);
  else {
    for (const item of data.scoreChanges) {
      const previous = item.previousScore === null ? "—" : String(item.previousScore);
      lines.push(
        `- ${item.title} / ${previous} → ${item.score} / ${TREND_MARK[item.trend]} ${item.trend} / ${item.comment}`,
      );
    }
  }
  lines.push("");

  lines.push("## 新增证据");
  if (data.evidences.length === 0) lines.push(EMPTY);
  else {
    for (const item of data.evidences) {
      lines.push(`- ${item.sourceTitle} / ${item.abstract} / ${item.ventureTitle}`);
    }
  }
  lines.push("");

  lines.push("## 新增关联");
  if (data.links.length === 0) lines.push(EMPTY);
  else {
    for (const item of data.links) {
      lines.push(
        `- ${item.fromTitle} → ${item.toTitle} / ${item.relationType}${item.note ? ` / ${item.note}` : ""}`,
      );
    }
  }
  lines.push("");

  // 模型只产出这一段叙述；四类事件段落始终由程序聚合，模型无权改写。
  if (options.narrative !== undefined && options.narrative.trim() !== "") {
    lines.push("## 本周综述（模型生成）");
    lines.push("");
    lines.push(options.narrative.trim());
    lines.push("");
    lines.push("> 以上综述由模型基于本周数据生成，仅供参考；四类事件以程序聚合结果为准。");
    lines.push("");
  }

  lines.push("## 管理员综述");
  lines.push(batch.adminNote.trim() === "" ? EMPTY : batch.adminNote.trim());
  lines.push("");

  return lines.join("\n");
}

export function briefCounts(data: BriefData): {
  added: number;
  scoreChanges: number;
  evidences: number;
  links: number;
} {
  return {
    added: data.added.length,
    scoreChanges: data.scoreChanges.length,
    evidences: data.evidences.length,
    links: data.links.length,
  };
}