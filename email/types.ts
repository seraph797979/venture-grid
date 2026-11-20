// modules/venture-grid/email/types.ts
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailProviderId = "resend" | "webhook" | "console";

export interface EmailProvider {
  readonly id: EmailProviderId;
  readonly label: string;
  send(message: EmailMessage): Promise<void>;
}

export type EmailStatus = {
  configured: boolean;
  provider: string | null;
  hint: string;
};