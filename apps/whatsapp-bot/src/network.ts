export class EdgeHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "EdgeHttpError";
  }
}

export function isTransientError(error: unknown) {
  if (error instanceof EdgeHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  if (error instanceof TypeError) return true;
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}

type RetryOptions = {
  attempts: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<unknown>;
};

export async function retryTransient<T>(operation: () => Promise<T>, options: RetryOptions) {
  const attempts = Math.max(1, Math.floor(options.attempts));
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? 1000);
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === attempts) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

export function pollBackoffMs(failureCount: number, baseDelayMs = 3000, maximumMs = 60_000) {
  return Math.min(maximumMs, baseDelayMs * 2 ** Math.max(0, failureCount - 1));
}
