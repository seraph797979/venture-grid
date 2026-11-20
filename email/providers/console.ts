// modules/venture-grid/email/providers/console.ts
/**
 * 本地开发用 provider：只把邮件打印到服务端 stdout，不真正发信。
 * 必须显式设置 VG_EMAIL_PROVIDER=console 才会启用。
 */
import type { EmailMessage, EmailProvider } from "../types";

export function createConsoleProvider(): EmailProvider {
  return {
    id: "console",
    label: "Console (dev)",
    async send(message: EmailMessage): Promise<void> {
      console.log("\n[vg-email] ─────────────────────────────");
      console.log(`[vg-email] to: ${message.to}`);
      console.log(`[vg-email] subject: ${message.subject}`);
      console.log(message.text);
      console.log("[vg-email] ─────────────────────────────\n");
    },
  };
}