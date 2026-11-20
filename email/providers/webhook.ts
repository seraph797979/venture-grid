// modules/venture-grid/email/providers/webhook.ts
/** 通用 webhook：把 {to, subject, text} POST 给你自己的邮件网关。 */
import { EmailError } from "../errors";
import type { EmailMessage, EmailProvider } from "../types";

const TIMEOUT_MS = 15_000;

export type WebhookEnv = Record<string, string | undefined>;

export function createWebhookProvider(env: WebhookEnv = process.env as WebhookEnv): EmailProvider {
  const url = (env.VG_EMAIL_WEBHOOK_URL ?? "").trim();
  const token = (env.VG_EMAIL_WEBHOOK_TOKEN ?? "").trim();
  return {
    id: "webhook",
    label: "Email webhook",
    async send(message: EmailMessage): Promise<void> {
      if (url === "") throw new EmailError("not_configured", "邮件 webhook 未配置 VG_EMAIL_WEBHOOK_URL");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token !== "") headers.Authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          throw new EmailError("timeout", "邮件 webhook 超时");
        }
        throw new EmailError("network", "无法连接邮件 webhook", error instanceof Error ? error.message : String(error));
      }
      if (!response.ok) {
        const text = await response.text();
        throw new EmailError("http", `邮件 webhook HTTP ${response.status}`, text.slice(0, 300));
      }
    },
  };
}