import { handleOptions, jsonResponse, requireBotToken, safeError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse(405, { error: "Metodo nao permitido." });
  if (!requireBotToken(req)) return jsonResponse(401, { error: "Token obrigatorio." });

  try {
    const supabase = serviceClient();
    const { error: recoveryError } = await supabase.rpc("dmr_recuperar_filas_operacionais_bot");
    if (recoveryError) throw recoveryError;

    const { data, error } = await supabase.rpc("dmr_status_operacional_bot");
    if (error) throw error;

    return jsonResponse(200, { sucesso: true, operacional: data ?? {} });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
