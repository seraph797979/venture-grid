// modules/venture-grid/services/notification-service.ts
/** 提案审核结果通知：确认与拒绝都发信；发送失败写审计但不回滚审核结果。 */
import { EmailError } from "../email/errors";
import { resolveEmailProvider } from "../email/registry";
import type { EmailProvider } from "../email/types";
import type { VentureProposal } from "../domain/types";
import type { VgService } from "./vg-service";

function baseUrl(): string {
  return (process.env.VG_PUBLIC_BASE_URL ?? "http://127.0.0.1:5277").replace(/\/+$/, "");
}

export async function notifyProposalDecision(
  service: VgService,
  proposal: VentureProposal,
  decision: "accepted" | "rejected",
  reason: string,
  providerOverride?: EmailProvider,
): Promise<void> {
  const to = proposal.email;
  const subject =
    decision === "accepted"
      ? `[Venture-Grid] 提案已采纳：${proposal.title}`
      : `[Venture-Grid] 提案未采纳：${proposal.title}`;

  if (to === null || to.trim() === "") {
    service.recordEmailLog({
      proposalId: proposal.id,
      toEmail: "—",
      subject,
      status: "failed",
      provider: "unconfigured",
      error: "提案未提供邮箱",
    });
    throw new EmailError("not_configured", "提案未提供邮箱，无法发送通知");
  }

  const link =
    decision === "accepted" && proposal.ventureId !== null
      ? `${baseUrl()}/venture/${proposal.ventureId}`
      : `${baseUrl()}/submit`;
  const text =
    decision === "accepted"
      ? [
          "你好，",
          "",
          `你在 Venture-Grid 提交的探究方向《${proposal.title}》已通过本周 AI 审核，并收录为一条 Venture。`,
          "",
          `审核意见：${reason === "" ? "（无）" : reason}`,
          `查看：${link}`,
          "",
          "此邮件由系统自动发送，请勿直接回复。",
        ].join("\n")
      : [
          "你好，",
          "",
          `你在 Venture-Grid 提交的探究方向《${proposal.title}》未通过本周审核。`,
          "",
          `审核意见：${reason === "" ? "（无）" : reason}`,
          `补充材料后可再次提交：${link}`,
          "",
          "此邮件由系统自动发送，请勿直接回复。",
        ].join("\n");

  let providerLabel = "unconfigured";
  try {
    const provider = providerOverride ?? resolveEmailProvider();
    providerLabel = provider.label;
    await provider.send({ to, subject, text });
    service.recordEmailLog({
      proposalId: proposal.id,
      toEmail: to,
      subject,
      status: "sent",
      provider: providerLabel,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    service.recordEmailLog({
      proposalId: proposal.id,
      toEmail: to,
      subject,
      status: "failed",
      provider: providerLabel,
      error: message.slice(0, 500),
    });
    throw error;
  }
}