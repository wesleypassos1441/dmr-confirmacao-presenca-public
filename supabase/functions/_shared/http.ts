export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("DMR_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dmr-bot-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

export function requireBotToken(req: Request) {
  const expected = Deno.env.get("DMR_BOT_TOKEN");
  const received = req.headers.get("x-dmr-bot-token") ?? "";
  return Boolean(expected && received && received === expected);
}

export function safeError(error: unknown, fallback = "Nao foi possivel processar a solicitacao.") {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "object"
      ? JSON.stringify(error)
      : String(error ?? "erro desconhecido");
  const sanitized = raw
    .replace(/(sbp_|eyJ)[A-Za-z0-9._-]{16,}/g, "[redigido]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redigido]")
    .slice(0, 500);
  console.error(`[edge] ${sanitized}`);
  return { error: fallback };
}

export function maskPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
