// modules/venture-grid/email/errors.ts
export type EmailErrorCode = "not_configured" | "http" | "network" | "timeout";

export class EmailError extends Error {
  constructor(
    readonly code: EmailErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

export function isEmailError(value: unknown): value is EmailError {
  return value instanceof EmailError;
}