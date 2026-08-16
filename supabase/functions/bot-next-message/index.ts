import { handleOptions, jsonResponse, requireBotToken, safeError } from "../_shared/http.ts";
import { assertSupabaseResult, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse(405, { error: "Metodo nao permitido." });
  if (!requireBotToken(req)) return jsonResponse(401, { error: "Token obrigatorio." });

  const supabase = serviceClient();

  try {
    const { error: cleanupError } = await supabase.rpc("dmr_cancelar_filas_expiradas_bot");
    if (cleanupError) throw cleanupError;

    const { error: recoveryError } = await supabase.rpc("dmr_recuperar_filas_operacionais_bot");
    if (recoveryError) throw recoveryError;

    const { data: filaGerada, error: filaError } = await supabase.rpc("gerar_fila_confirmacoes");
    if (filaError) throw filaError;

    const { error: postGenerationCleanupError } = await supabase.rpc("dmr_cancelar_filas_expiradas_bot");
    if (postGenerationCleanupError) throw postGenerationCleanupError;

    const { data: relatoriosGerados, error: relatorioError } = await supabase.rpc("dmr_enfileirar_relatorios_automaticos");
    if (relatorioError) {
      console.error("Falha ao enfileirar relatorios automaticos:", relatorioError.message);
    }

    const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
    const staleResult = await supabase
      .from("fila_mensagens")
      .select("id, tentativas, max_tentativas")
      .eq("status", "processando")
      .lt("processando_em", staleBefore)
      .limit(50);
    assertSupabaseResult(staleResult);

    for (const stale of staleResult.data ?? []) {
      const attempts = Number(stale.tentativas ?? 0);
      const maxAttempts = Number(stale.max_tentativas ?? 3);
      assertSupabaseResult(await supabase
        .from("fila_mensagens")
        .update({
          status: attempts < maxAttempts ? "pendente" : "erro",
          processando_em: null,
          ultimo_erro: "Processamento anterior interrompido.",
        })
        .eq("id", stale.id)
        .eq("status", "processando"));
    }

    const { data: rows, error } = await supabase
      .from("fila_mensagens")
      .select("id, escala_colaborador_id, contato_alerta_dmr_id, tipo, prioridade, telefone_destino, mensagem, agendado_para, tentativas, max_tentativas")
      .eq("status", "pendente")
      .lte("agendado_para", new Date().toISOString())
      .order("prioridade", { ascending: true })
      .order("agendado_para", { ascending: true })
      .limit(50);
    if (error) throw error;

    for (const exhausted of (rows ?? []).filter((row) => Number(row.tentativas ?? 0) >= Number(row.max_tentativas ?? 3))) {
      assertSupabaseResult(await supabase
        .from("fila_mensagens")
        .update({ status: "erro", ultimo_erro: "Limite de tentativas atingido." })
        .eq("id", exhausted.id)
        .eq("status", "pendente"));
    }

    const candidates = (rows ?? []).filter((row) => Number(row.tentativas ?? 0) < Number(row.max_tentativas ?? 3));
    let next = candidates.shift();

    while (next) {
      if (next.tipo === "alerta_sem_resposta") {
        const { data: dentroDaJornada, error: jornadaError } = await supabase.rpc(
          "dmr_alerta_sem_resposta_na_jornada",
          {
            p_contato_id: next.contato_alerta_dmr_id,
            p_agendado_para: next.agendado_para,
          },
        );
        if (jornadaError) throw jornadaError;

        if (!dentroDaJornada) {
          assertSupabaseResult(await supabase
            .from("fila_mensagens")
            .update({
              status: "cancelada",
              ultimo_erro: "fora_da_jornada_do_contato",
            })
            .eq("id", next.id)
            .eq("status", "pendente"));
          next = candidates.shift();
          continue;
        }
      }
      break;
    }

    if (!next) return jsonResponse(200, { mensagem: null, filaGerada, relatoriosGerados });

    const { data: claimed, error: updateError } = await supabase
      .from("fila_mensagens")
      .update({
        status: "processando",
        processando_em: new Date().toISOString(),
        tentativas: Number(next.tentativas ?? 0) + 1,
      })
      .eq("id", next.id)
      .eq("status", "pendente")
      .select("id, escala_colaborador_id, tipo, prioridade, telefone_destino, mensagem")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!claimed) return jsonResponse(200, { mensagem: null, filaGerada, relatoriosGerados });

    const { data: config, error: configError } = await supabase
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", "intervalos_bot")
      .maybeSingle();
    if (configError) throw configError;

    const intervalos = config?.valor ?? null;
    return jsonResponse(200, { mensagem: claimed, intervalos, filaGerada, relatoriosGerados });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
