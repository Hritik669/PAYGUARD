export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class TransientWebhookError extends Error {
  readonly transient = true;

  constructor(message: string) {
    super(message);
    this.name = "TransientWebhookError";
  }
}

export function isTransientWebhookError(error: unknown): boolean {
  return error instanceof TransientWebhookError;
}
