// modules/venture-grid/email/providers/resend.ts
/** Resend HTTP API（https://resend.com）。 */
import { EmailError } from "../errors";
import type { EmailMessage, EmailProvider } from "../types";

const TIMEOUT_MS = 15_000;

export type ResendEnv = Record<string, string | undefined>;

export function createResendProvider(env: ResendEnv = process.env as ResendEnv): EmailProvider {
  const apiKey = (env.VG_EMAIL_API_KEY ?? env.RESEND_API_KEY ?? "").trim();
  const from = (env.VG_EMAIL_FROM ?? "").trim();
  return {
    id: "resend",
    label: "Resend",
    async send(message: EmailMessage): Promise<void> {
      if (apiKey === "" || from === "") {
        throw new EmailError("not_configured", "Resend 未配置 VG_EMAIL_API_KEY / VG_EMAIL_FROM");
      }
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          throw new EmailError("timeout", "邮件发送超时");
        }
        throw new EmailError("network", "无法连接邮件服务", error instanceof Error ? error.message : String(error));
      }
      if (!response.ok) {
        const text = await response.text();
        throw new EmailError("http", `邮件服务 HTTP ${response.status}`, text.slice(0, 300));
      }
    },
  };
}