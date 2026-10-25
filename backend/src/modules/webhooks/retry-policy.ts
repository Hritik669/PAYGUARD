export const MAX_WEBHOOK_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;

export function nextRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Math.max(1, attempt);
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (safeAttempt - 1));
  const jitter = Math.floor(random() * exponential * 0.2);
  return exponential + jitter;
}

export function isDeadLetter(attemptNumber: number): boolean {
  return attemptNumber >= MAX_WEBHOOK_ATTEMPTS;
}
