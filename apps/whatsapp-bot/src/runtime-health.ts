export const RESTART_EXIT_CODE = 75;

export type WhatsappRuntime = {
  pupBrowser?: { connected?: boolean } | null;
  pupPage?: {
    isClosed?: () => boolean;
    url?: () => string;
    title?: () => Promise<string> | string;
    evaluate?: <T>(fn: () => T) => Promise<T> | T;
  } | null;
};

const browserProblemFragments = [
  "out of memory",
  "codigo de erro: out of memory",
  "código de erro: out of memory",
  "esta pagina esta com problemas",
  "esta página está com problemas",
  "this page is having a problem",
  "edge-error://",
  "chrome-error://",
];

export function isWhatsappRuntimeHealthy(runtime: WhatsappRuntime) {
  return runtime.pupBrowser?.connected === true && runtime.pupPage?.isClosed?.() === false;
}

export async function findWhatsappRuntimeProblem(runtime: WhatsappRuntime, timeoutMs = 10_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      inspectWhatsappRuntime(runtime),
      new Promise<"runtime_sem_resposta">((resolve) => {
        timeout = setTimeout(() => resolve("runtime_sem_resposta"), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function inspectWhatsappRuntime(runtime: WhatsappRuntime) {
  if (!isWhatsappRuntimeHealthy(runtime)) return "runtime_indisponivel";
  const page = runtime.pupPage;
  if (!page) return "runtime_indisponivel";

  try {
    const url = typeof page.url === "function" ? page.url() : "";
    const title = typeof page.title === "function" ? await page.title() : "";
    const bodyText = typeof page.evaluate === "function"
      ? await page.evaluate(() => document.body?.innerText ?? "")
      : "";
    const diagnosticText = `${url}\n${title}\n${bodyText}`;

    if (isWhatsappBrowserProblemPage(diagnosticText)) return "pagina_whatsapp_com_erro";
  } catch (error) {
    if (isWhatsappRuntimeUnavailable(error)) return "runtime_indisponivel";
  }

  return null;
}

export function isWhatsappBrowserProblemPage(value: unknown) {
  const text = normalizeDiagnosticText(value);
  return browserProblemFragments.some((fragment) => text.includes(fragment));
}

export function isWhatsappRuntimeUnavailable(error: unknown) {
  const message = normalizeDiagnosticText(error instanceof Error ? error.message : String(error ?? ""));
  return [
    "detached frame",
    "execution context was destroyed",
    "target closed",
    "session closed",
    "connection closed",
    "most likely the page has been closed",
    "page.navigate timed out",
    "tempo limite ao abrir o whatsapp web",
    "out of memory",
  ].some((fragment) => message.includes(fragment));
}

export function shouldRecycleWhatsappRuntime(input: {
  uptimeMs: number;
  maxUptimeMs: number;
  busy: boolean;
}) {
  return input.maxUptimeMs > 0 && input.uptimeMs >= input.maxUptimeMs && !input.busy;
}

export function buildWhatsappUserAgent(browserPath: string | undefined, browserVersion: string | undefined) {
  const major = String(browserVersion ?? "").match(/^\d+/)?.[0];
  if (!major) return undefined;

  const chromium = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  return /msedge|edge/i.test(browserPath ?? "") ? `${chromium} Edg/${major}.0.0.0` : chromium;
}

function normalizeDiagnosticText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
