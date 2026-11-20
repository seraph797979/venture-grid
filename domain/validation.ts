// modules/venture-grid/domain/validation.ts
import type { RelationType, VentureStatus } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export const VENTURE_STATUSES: readonly VentureStatus[] = ["active", "suspended", "closed"];
export const RELATION_TYPES: readonly RelationType[] = [
  "support",
  "contradict",
  "depend",
  "parallel",
];

export const MAX_TITLE = 200;
export const MAX_COMMENT = 4000;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function fail(errors: string[]): ValidationResult {
  return { ok: false, errors };
}

export type VentureInput = {
  title: string;
  summary?: string;
  hypothesis?: string;
  parentId?: string | null;
  status?: VentureStatus;
  tags?: string[];
};

export function validateVentureInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const title = asString(input.title).trim();
  if (title === "") errors.push("title 不能为空");
  if (title.length > MAX_TITLE) errors.push(`title 超过 ${MAX_TITLE} 字`);
  const status = input.status;
  if (status !== undefined && !VENTURE_STATUSES.includes(status as VentureStatus)) {
    errors.push(`status 必须是 ${VENTURE_STATUSES.join(" / ")}`);
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) {
      errors.push("tags 必须是字符串数组");
    }
  }
  return errors.length === 0 ? { ok: true } : fail(errors);
}

export type ScoreInput = {
  score: number;
  comment: string;
  evidenceRefs?: string[];
  batchId?: string;
};

export function validateScoreInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const score = input.score;
  if (typeof score !== "number" || Number.isNaN(score)) {
    errors.push("score 必须是数字");
  } else if (score < 0 || score > 100) {
    errors.push("score 必须在 0–100 之间");
  }
  const comment = asString(input.comment).trim();
  if (comment === "") errors.push("comment 不能为空（打分必须留评审意见）");
  if (comment.length > MAX_COMMENT) errors.push(`comment 超过 ${MAX_COMMENT} 字`);
  if (input.evidenceRefs !== undefined) {
    if (
      !Array.isArray(input.evidenceRefs) ||
      input.evidenceRefs.some((ref) => typeof ref !== "string")
    ) {
      errors.push("evidenceRefs 必须是字符串数组");
    }
  }
  return errors.length === 0 ? { ok: true } : fail(errors);
}

export type EvidenceInput = {
  sourceTitle: string;
  sourceUrl?: string | null;
  rawText: string;
  tags?: string[];
  documentId?: string | null;
};

export function validateEvidenceInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (asString(input.sourceTitle).trim() === "") errors.push("sourceTitle 不能为空");
  if (asString(input.rawText).trim() === "") {
    errors.push("rawText 不能为空（模型需要原文才能生成摘要）");
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) {
      errors.push("tags 必须是字符串数组");
    }
  }
  return errors.length === 0 ? { ok: true } : fail(errors);
}

export function validateLinkInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (asString(input.fromVentureId).trim() === "") errors.push("fromVentureId 不能为空");
  if (asString(input.toVentureId).trim() === "") errors.push("toVentureId 不能为空");
  if (input.fromVentureId === input.toVentureId) errors.push("不允许自关联");
  if (!RELATION_TYPES.includes(input.relationType as RelationType)) {
    errors.push(`relationType 必须是 ${RELATION_TYPES.join(" / ")}`);
  }
  return errors.length === 0 ? { ok: true } : fail(errors);
}

export function validateDocumentInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const slug = asString(input.slug).trim();
  if (slug === "") errors.push("slug 不能为空");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    errors.push("slug 只能包含字母、数字与连字符");
  }
  if (asString(input.title).trim() === "") errors.push("title 不能为空");
  if (typeof input.bodyMd !== "string") errors.push("bodyMd 必须是字符串");
  return errors.length === 0 ? { ok: true } : fail(errors);
}

/** 访客提案：比管理员录入更严格的下限，防止空标题/一句话灌水。 */
export const MIN_PROPOSAL_HYPOTHESIS = 20;
export const MAX_PROPOSAL_HYPOTHESIS = 6000;

export function validateProposalInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const title = asString(input.title).trim();
  if (title.length < 4) errors.push("title 至少 4 个字符");
  if (title.length > MAX_TITLE) errors.push(`title 超过 ${MAX_TITLE} 字`);
  const hypothesis = asString(input.hypothesis).trim();
  if (hypothesis.length < MIN_PROPOSAL_HYPOTHESIS) {
    errors.push(`hypothesis 至少 ${MIN_PROPOSAL_HYPOTHESIS} 个字符（请把想法说清楚）`);
  }
  if (hypothesis.length > MAX_PROPOSAL_HYPOTHESIS) {
    errors.push(`hypothesis 超过 ${MAX_PROPOSAL_HYPOTHESIS} 字`);
  }
  if (asString(input.summary).length > 2000) errors.push("summary 超过 2000 字");
  if (asString(input.referencesText).length > 4000) errors.push("referencesText 超过 4000 字");
  if (asString(input.submitter).length > 80) errors.push("submitter 超过 80 字");
  const email = asString(input.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("email 无效（审核结果会发送到这个邮箱）");
  }
  return errors.length === 0 ? { ok: true } : fail(errors);
}

/** 把任意输入收敛成字符串数组（去重、去空、限长）。 */
export function normalizeTags(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().slice(0, 40);
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}