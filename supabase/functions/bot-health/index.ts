import { handleOptions, jsonResponse, requireBotToken, safeError } from "../_shared/http.ts";
import { assertSupabaseResult, serviceClient } from "../_shared/supabase.ts";

type Payload = {
  bot_id?: string;
  status?: string;
  detalhes?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse(405, { error: "Metodo nao permitido." });
  if (!requireBotToken(req)) return jsonResponse(401, { error: "Token obrigatorio." });

  const supabase = serviceClient();

  try {
    const payload = (await req.json().catch(() => ({}))) as Payload;
    assertSupabaseResult(await supabase.from("bot_heartbeats").insert({
      bot_id: String(payload.bot_id || "bot-local").slice(0, 80),
      status: String(payload.status || "online").slice(0, 40),
      detalhes: payload.detalhes ?? {},
    }));

    return jsonResponse(200, { sucesso: true });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
