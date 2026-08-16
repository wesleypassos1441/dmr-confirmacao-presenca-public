type RetryOptions = {
  delaysMs?: number[];
};

const NETWORK_ERROR_PATTERN = /failed to fetch|fetch failed|networkerror|network request failed|load failed|econnreset|econnrefused|etimedout|enotfound|dns/i;

export function isTransientNetworkError(error: unknown) {
  if (!error) return false;
  if (error instanceof TypeError && NETWORK_ERROR_PATTERN.test(error.message)) return true;

  if (typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; cause?: unknown };
    const description = [value.code, value.message, value.details]
      .filter((item) => item !== undefined && item !== null)
      .map(String)
      .join(" ");
    if (NETWORK_ERROR_PATTERN.test(description)) return true;
    if (value.cause && value.cause !== error) return isTransientNetworkError(value.cause);
  }

  return NETWORK_ERROR_PATTERN.test(String(error));
}

export async function retryTransientDashboardLoad<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
) {
  const delaysMs = options.delaysMs ?? [400, 1_200];

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientNetworkError(error) || attempt >= delaysMs.length) throw error;
      await wait(delaysMs[attempt] ?? 0);
    }
  }
}

export function dashboardLoadErrorMessage(error: unknown) {
  if (!isTransientNetworkError(error)) return "";
  return "A conexão com o sistema foi interrompida. Verifique sua internet e clique em Atualizar para tentar novamente.";
}

function wait(delayMs: number) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
}
