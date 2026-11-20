// modules/venture-grid/services/proposal-review.ts
/**
 * 每周 agent 的提案审核：拉取 pending 提案 → 模型判定 → 采纳/拒绝 → 发邮件。
 * - 单条失败不阻塞其他提案，也不阻塞周报（错误计入 summary）
 * - 模型输出解析失败时保持 pending，下周再试
 */
import type { EmailProvider } from "../email/types";
import { buildProposalReviewPrompt, parseProposalDecision } from "../llm/proposal-prompt";
import type { LlmProvider } from "../llm/types";
import { chatRecorded } from "./llm-service";
import { notifyProposalDecision } from "./notification-service";
import type { VgService } from "./vg-service";

export type ProposalReviewSummary = {
  reviewed: number;
  accepted: number;
  rejected: number;
  emailSent: number;
  emailFailed: number;
  failed: number;
  errors: string[];
};

export type ReviewOptions = {
  provider?: LlmProvider;
  emailProvider?: EmailProvider;
  limit?: number;
};

export async function reviewPendingProposals(
  service: VgService,
  options: ReviewOptions = {},
): Promise<ProposalReviewSummary> {
  const summary: ProposalReviewSummary = {
    reviewed: 0,
    accepted: 0,
    rejected: 0,
    emailSent: 0,
    emailFailed: 0,
    failed: 0,
    errors: [],
  };

  const pending = service.listProposals("pending").slice(0, Math.max(1, Math.min(options.limit ?? 5, 20)));
  if (pending.length === 0) return summary;

  const existingTitles = service.ventures.list().map((venture) => venture.title);

  for (const proposal of pending) {
    try {
      const prompt = buildProposalReviewPrompt(proposal, existingTitles);
      const reply = await chatRecorded(
        service,
        {
          system: prompt.system,
          user: prompt.user,
          purpose: "proposal-review",
          temperature: 0.1,
          maxTokens: 600,
        },
        options.provider,
      );
      const decision = parseProposalDecision(reply.text);
      if (decision === null) {
        summary.failed += 1;
        summary.errors.push(`${proposal.id}: 模型输出无法解析`);
        continue;
      }

      const reason = decision.reason === "" ? "（模型未给出理由）" : decision.reason;

      if (decision.decision === "accept") {
        const result = service.acceptProposal(proposal.id, {
          note: reason,
          reviewedBy: "ai",
          tags: decision.tags,
        });
        summary.accepted += 1;
        summary.reviewed += 1;
        try {
          await notifyProposalDecision(service, result.proposal, "accepted", reason, options.emailProvider);
          summary.emailSent += 1;
        } catch (error) {
          summary.emailFailed += 1;
          summary.errors.push(
            `${proposal.id}: 邮件发送失败 ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        const updated = service.rejectProposal(proposal.id, reason, "ai");
        summary.rejected += 1;
        summary.reviewed += 1;
        try {
          await notifyProposalDecision(service, updated, "rejected", reason, options.emailProvider);
          summary.emailSent += 1;
        } catch (error) {
          summary.emailFailed += 1;
          summary.errors.push(
            `${proposal.id}: 邮件发送失败 ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      summary.failed += 1;
      summary.errors.push(
        `${proposal.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return summary;
}