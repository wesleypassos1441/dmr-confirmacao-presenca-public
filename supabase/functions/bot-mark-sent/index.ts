import { handleOptions, jsonResponse, requireBotToken, safeError } from "../_shared/http.ts";
import { assertSupabaseResult, serviceClient } from "../_shared/supabase.ts";

type Payload = {
  fila_mensagem_id?: string;
  whatsapp_message_id?: string;
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

    const sentAt = new Date().toISOString();
    const { data: queue, error: queueError } = await supabase
      .from("fila_mensagens")
      .update({ status: "enviada", enviada_em: sentAt, ultimo_erro: null })
      .eq("id", payload.fila_mensagem_id)
      .select("id, escala_colaborador_id, tipo")
      .maybeSingle();
    if (queueError) throw queueError;
    if (!queue) return jsonResponse(404, { error: "Mensagem nao encontrada." });

    const update: Record<string, unknown> = { status_confirmacao: "mensagem_enviada" };
    if (queue.tipo === "confirmacao_inicial") update.mensagem_enviada_em = sentAt;
    if (queue.tipo === "lembrete_1") update.primeiro_lembrete_enviado_em = sentAt;
    if (queue.tipo === "lembrete_2") update.segundo_lembrete_enviado_em = sentAt;
    if (queue.tipo === "alerta_sem_resposta") update.alerta_sem_resposta_enviado_em = sentAt;
    if (String(queue.tipo).startsWith("alerta_resposta_incompreensivel")) update.alerta_incompreensivel_enviado_em = sentAt;

    if (queue.tipo === "reenvio_manual" || queue.tipo === "relatorio_diario" || queue.tipo === "comunicado_manual") {
      // O estado operacional permanece inalterado; sao mensagens pontuais fora do fluxo automatico.
    } else if (String(queue.tipo).startsWith("alerta_")) {
      assertSupabaseResult(await supabase.from("alertas_dmr").update({ enviado_em: sentAt }).eq("escala_colaborador_id", queue.escala_colaborador_id).is("enviado_em", null));
    } else {
      assertSupabaseResult(await supabase.from("escala_colaboradores").update(update).eq("id", queue.escala_colaborador_id));
    }

    const logResult = await supabase.from("logs_acoes").insert({
      acao: `envio_${queue.tipo}`,
      entidade: "fila_mensagens",
      entidade_id: queue.id,
      detalhes: { whatsapp_message_id: payload.whatsapp_message_id ? "registrado" : "nao_informado" },
    });
    if (logResult.error) {
      console.error("Falha ao registrar auditoria do envio:", logResult.error.message);
    }

    return jsonResponse(200, { sucesso: true });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
