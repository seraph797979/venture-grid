// modules/venture-grid/email/registry.ts
import { EmailError } from "./errors";
import { createConsoleProvider } from "./providers/console";
import { createResendProvider } from "./providers/resend";
import { createWebhookProvider } from "./providers/webhook";
import type { EmailProvider, EmailProviderId, EmailStatus } from "./types";

type Env = Record<string, string | undefined>;

function explicitProvider(env: Env): EmailProviderId | null {
  const raw = (env.VG_EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "") return null;
  if (raw === "resend" || raw === "webhook" || raw === "console") return raw;
  return null;
}

/** 显式 provider 优先；否则按已配置的凭据推断（webhook > resend）。 */
export function resolveEmailProvider(env: Env = process.env as Env): EmailProvider {
  const explicit = explicitProvider(env);
  if (explicit === "console") return createConsoleProvider();
  if (explicit === "resend") return createResendProvider(env);
  if (explicit === "webhook") return createWebhookProvider(env);

  if ((env.VG_EMAIL_WEBHOOK_URL ?? "").trim() !== "") return createWebhookProvider(env);
  const key = (env.VG_EMAIL_API_KEY ?? env.RESEND_API_KEY ?? "").trim();
  if (key !== "" && (env.VG_EMAIL_FROM ?? "").trim() !== "") return createResendProvider(env);

  throw new EmailError(
    "not_configured",
    "未配置邮件服务",
    "设置 VG_EMAIL_PROVIDER=resend（VG_EMAIL_API_KEY + VG_EMAIL_FROM）或 webhook（VG_EMAIL_WEBHOOK_URL）",
  );
}

export function emailAvailable(env: Env = process.env as Env): boolean {
  try {
    resolveEmailProvider(env);
    return true;
  } catch {
    return false;
  }
}

export function describeEmail(env: Env = process.env as Env): EmailStatus {
  try {
    const provider = resolveEmailProvider(env);
    return {
      configured: true,
      provider: provider.label,
      hint: `已配置；提案审核结果会自动发信（${provider.label}）`,
    };
  } catch {
    return {
      configured: false,
      provider: null,
      hint: "未配置邮件服务：提案仍会被 AI 审核，但不会发信（设置 VG_EMAIL_PROVIDER / VG_EMAIL_API_KEY / VG_EMAIL_FROM，或 VG_EMAIL_WEBHOOK_URL）",
    };
  }
}