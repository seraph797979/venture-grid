// modules/venture-grid/llm/prompts.ts
/**
 * 提示词。两条硬约束贯穿全部：
 *  - 只依据输入事实，不编造条目
 *  - 保持原文语言，不做翻译（PRD C2）
 */
import type { BriefData } from "../domain/types";

const MAX_RAW_CHARS = 12_000;

export type EvidencePromptInput = {
  ventureTitle: string;
  sourceTitle: string;
  sourceUrl: string | null;
  rawText: string;
};

export function buildEvidenceAbstractPrompt(input: EvidencePromptInput): {
  system: string;
  user: string;
} {
  const raw =
    input.rawText.length > MAX_RAW_CHARS
      ? `${input.rawText.slice(0, MAX_RAW_CHARS)}\n\n[原文已截断，共 ${input.rawText.length} 字符]`
      : input.rawText;
  return {
    system: [
      "你是 Venture-Grid 的研究助理，只负责把证据原文压缩成可审计摘要。",
      "规则：",
      "1. 只依据用户提供的原文，不引入外部知识，不写推断性结论。",
      "2. 2–4 句，最多 220 字（或等量外文）。",
      "3. 保持原文语言，不翻译、不改写专有名词。",
      "4. 只输出摘要正文：不要标题、列表、代码块、前后缀说明。",
    ].join("\n"),
    user: [
      `Venture：${input.ventureTitle}`,
      `来源标题：${input.sourceTitle}`,
      `来源链接：${input.sourceUrl === null || input.sourceUrl === "" ? "（无）" : input.sourceUrl}`,
      "",
      "原文：",
      '"""',
      raw,
      '"""',
    ].join("\n"),
  };
}

export function buildWeeklyNarrativePrompt(data: BriefData): { system: string; user: string } {
  const payload = {
    batch: data.batch.name,
    period: { start: data.batch.startTime.slice(0, 10), end: data.batch.endTime.slice(0, 10) },
    added: data.added.map((item) => ({ title: item.title, status: item.status })),
    scoreChanges: data.scoreChanges.map((item) => ({
      title: item.title,
      previous: item.previousScore,
      current: item.score,
      trend: item.trend,
      comment: item.comment,
    })),
    evidences: data.evidences.map((item) => ({
      source: item.sourceTitle,
      abstract: item.abstract,
      venture: item.ventureTitle,
    })),
    links: data.links.map((item) => ({
      from: item.fromTitle,
      to: item.toTitle,
      type: item.relationType,
      note: item.note,
    })),
    adminNote: data.batch.adminNote,
  };

  return {
    system: [
      "你是 Venture-Grid 的周报撰写人。输入是本周结构化变化数据（JSON）。",
      "规则：",
      "1. 只复述输入里出现过的 Venture / 证据 / 数字，禁止编造。",
      "2. 120–300 字（或等量外文），3–5 句。",
      "3. 保持数据中的原始语言，不翻译。",
      "4. 只输出一段纯文本：不要标题、编号、列表、Markdown、前后缀说明。",
      "5. 不做宏大预言，只描述本周判断与证据的走向。",
    ].join("\n"),
    user: JSON.stringify(payload, null, 2),
  };
}