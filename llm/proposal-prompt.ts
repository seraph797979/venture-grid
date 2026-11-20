// modules/venture-grid/llm/proposal-prompt.ts
/** 每周提案审核的提示词与解析。 */
import type { VentureProposal } from "../domain/types";

export type ProposalDecision = {
  decision: "accept" | "reject";
  reason: string;
  tags: string[];
};

export function buildProposalReviewPrompt(
  proposal: VentureProposal,
  existingTitles: string[],
): { system: string; user: string } {
  return {
    system: [
      "你是 Venture-Grid 的提案审核 agent。判断访客提交的探究方向是否符合章程：",
      "1. 面向长期（代际甚至十亿年级）的宜居生存与文明存续不确定性；",
      "2. 是一个可推演、可打分、可持续补充证据的探究方向，而不是口号、广告、新闻转载或纯情绪表达；",
      "3. 不渲染末日、不承诺结论、不夹带政治宣传或商业推广；",
      "4. 与已有分支重复度低；如果只是已有分支的子问题，也应当拒绝并说明。",
      "",
      "只输出一个合法 JSON 对象，不要输出任何解释或代码块围栏：",
      '{"decision":"accept" 或 "reject","reason":"不超过 120 字，使用提案的语言","tags":["最多 3 个短标签"]}',
    ].join("\n"),
    user: JSON.stringify(
      {
        proposal: {
          title: proposal.title,
          summary: proposal.summary,
          hypothesis: proposal.hypothesis,
          references: proposal.referencesText,
          tags: proposal.tags,
        },
        existingVentures: existingTitles.slice(0, 40),
      },
      null,
      2,
    ),
  };
}

/** 容错解析：去掉代码块围栏，截取第一个 JSON 对象。 */
export function parseProposalDecision(text: string): ProposalDecision | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const decision = record.decision;
  if (decision !== "accept" && decision !== "reject") return null;
  const reason = typeof record.reason === "string" ? record.reason.trim().slice(0, 240) : "";
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 3)
    : [];
  return { decision, reason, tags };
}