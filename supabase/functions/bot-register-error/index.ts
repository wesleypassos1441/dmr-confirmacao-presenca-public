import { handleOptions, jsonResponse, maskPhone, requireBotToken, safeError } from "../_shared/http.ts";
import { assertSupabaseResult, serviceClient } from "../_shared/supabase.ts";

type Payload = {
  fila_mensagem_id?: string;
  erro?: string;
  telefone_destino?: string;
  falha_transitoria_sessao?: boolean;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse(405, { error: "Metodo nao permitido." });
  if (!requireBotToken(req)) return jsonResponse(401, { error: "Token obrigatorio." });

  const supabase = serviceClient();

  try {
    const payload = (await req.json().catch(() => ({}))) as Payload;
    if (!payload.fila_mensagem_id) return jsonResponse(400, { error: "fila_mensagem_id obrigatorio." });

    const safeMessage = String(payload.erro ?? "erro de envio").slice(0, 240);
    const queueResult = await supabase
      .from("fila_mensagens")
      .select("id, tentativas, max_tentativas")
      .eq("id", payload.fila_mensagem_id)
      .maybeSingle();
    assertSupabaseResult(queueResult);
    if (!queueResult.data) return jsonResponse(404, { error: "Mensagem nao encontrada." });

    const attempts = Number(queueResult.data.tentativas ?? 0);
    const maxAttempts = Number(queueResult.data.max_tentativas ?? 3);
    const transientSessionFailure = payload.falha_transitoria_sessao === true;
    const effectiveAttempts = transientSessionFailure ? Math.max(0, attempts - 1) : attempts;
    const shouldRetry = transientSessionFailure || effectiveAttempts < maxAttempts;
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    const queueUpdate: Record<string, unknown> = {
      status: "pendente",
      processando_em: null,
      ultimo_erro: safeMessage,
      tentativas: effectiveAttempts,
    };
    if (shouldRetry) {
      queueUpdate.agendado_para = retryAt;
    } else {
      queueUpdate.status = "erro";
    }

    assertSupabaseResult(await supabase
      .from("fila_mensagens")
      .update(queueUpdate)
      .eq("id", payload.fila_mensagem_id));

    assertSupabaseResult(await supabase.from("logs_acoes").insert({
      acao: transientSessionFailure ? "sessao_whatsapp_indisponivel" : "erro_bot",
      entidade: "fila_mensagens",
      entidade_id: payload.fila_mensagem_id,
      detalhes: { erro: safeMessage, telefone: maskPhone(payload.telefone_destino) },
    }));

    return jsonResponse(200, { sucesso: true, nova_tentativa: shouldRetry });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
