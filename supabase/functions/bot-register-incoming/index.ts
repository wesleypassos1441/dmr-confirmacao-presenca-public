import { handleOptions, jsonResponse, requireBotToken, safeError } from "../_shared/http.ts";
import { assertSupabaseResult, serviceClient } from "../_shared/supabase.ts";
import {
  absenceAlert,
  absenceReply,
  chaveFila,
  confirmationReply,
  normalizarResposta,
  unclearAlert,
  unclearGuidance,
} from "../_shared/presence.ts";

type Payload = {
  telefone_origem?: string;
  mensagem_original?: string;
  recebida_em?: string;
  whatsapp_message_id?: string;
};

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneLookupCandidates(value: unknown) {
  const phone = digits(value);
  const candidates = new Set<string>();

  const add = (candidate: string) => {
    const clean = digits(candidate);
    if (clean) candidates.add(clean);
  };

  const addBrazilianVariants = (national: string) => {
    if (national.length === 10) {
      const withMobileNine = `${national.slice(0, 2)}9${national.slice(2)}`;
      add(national);
      add(`55${national}`);
      add(withMobileNine);
      add(`55${withMobileNine}`);
      return;
    }

    if (national.length === 11) {
      const withoutMobileNine = national[2] === "9"
        ? `${national.slice(0, 2)}${national.slice(3)}`
        : "";
      add(national);
      add(`55${national}`);
      if (withoutMobileNine) {
        add(withoutMobileNine);
        add(`55${withoutMobileNine}`);
      }
    }
  };

  if (phone.startsWith("55")) {
    const national = phone.slice(2);
    add(phone);
    add(national);
    addBrazilianVariants(national);
  } else {
    add(phone);
    addBrazilianVariants(phone);
  }

  return [...candidates];
}

function formatTime(value: string) {
  return String(value ?? "").slice(0, 5);
}

function dateInSaoPaulo(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function enqueueDmrAlerts(
  supabase: ReturnType<typeof serviceClient>,
  item: any,
  motivo: "nao_comparecera" | "resposta_incompreensivel",
  tipo: "alerta_nao_comparecera" | "alerta_resposta_incompreensivel",
  message: string,
) {
  const { data: contacts, error } = await supabase.from("contatos_alerta_dmr").select("id, telefone").eq("ativo", true);
  if (error) throw error;

  for (const contact of contacts ?? []) {
    assertSupabaseResult(await supabase.from("alertas_dmr").upsert({
      escala_colaborador_id: item.id,
      contato_alerta_dmr_id: contact.id,
      motivo,
      mensagem: message,
    }, { onConflict: "escala_colaborador_id,motivo,contato_alerta_dmr_id", ignoreDuplicates: true }));

    assertSupabaseResult(await supabase.from("fila_mensagens").upsert({
      escala_colaborador_id: item.id,
      contato_alerta_dmr_id: contact.id,
      tipo,
      status: "pendente",
      prioridade: "alta",
      telefone_destino: contact.telefone,
      mensagem: message,
      agendado_para: new Date().toISOString(),
      chave_unica: chaveFila(item.id, tipo, contact.id),
    }, { onConflict: "chave_unica", ignoreDuplicates: true }));
  }
}

async function enqueueAutomaticReports(supabase: ReturnType<typeof serviceClient>) {
  const { error } = await supabase.rpc("dmr_enfileirar_relatorios_automaticos");
  if (error) {
    console.error("Falha ao enfileirar relatorios automaticos apos resposta:", error.message);
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse(405, { error: "Metodo nao permitido." });
  if (!requireBotToken(req)) return jsonResponse(401, { error: "Token obrigatorio." });

  const supabase = serviceClient();

  try {
    const payload = (await req.json().catch(() => ({}))) as Payload;
    const phone = digits(payload.telefone_origem);
    const phoneCandidates = phoneLookupCandidates(payload.telefone_origem);
    const original = String(payload.mensagem_original ?? "").slice(0, 1000);
    if (phone.length < 10 || !original) return jsonResponse(400, { error: "Telefone e mensagem sao obrigatorios." });
    const receivedDate = payload.recebida_em ? new Date(payload.recebida_em) : new Date();
    if (Number.isNaN(receivedDate.getTime())) return jsonResponse(400, { error: "Horario da resposta invalido." });
    const receivedAt = receivedDate.toISOString();

    const existingMessage = payload.whatsapp_message_id
      ? await supabase
        .from("mensagens_recebidas")
        .select("id, processada_em")
        .eq("whatsapp_message_id", payload.whatsapp_message_id)
        .maybeSingle()
      : { data: null, error: null };
    assertSupabaseResult(existingMessage);
    if (existingMessage.data?.processada_em) {
      return jsonResponse(200, { sucesso: true, duplicada: true });
    }

    const normalized = normalizarResposta(original);
    const { data: colaborador, error: colaboradorError } = await supabase
      .from("colaboradores")
      .select("id, nome, telefone")
      .in("telefone_normalizado", phoneCandidates)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (colaboradorError) throw colaboradorError;
    if (!colaborador) return jsonResponse(404, { error: "Colaborador nao encontrado." });

    const today = dateInSaoPaulo(receivedDate);
    const allowedStatuses = existingMessage.data
      ? ["pendente", "mensagem_agendada", "mensagem_enviada", "sem_resposta", "resposta_incompreensivel", "erro_envio", "confirmado", "nao_comparecera"]
      : ["pendente", "mensagem_agendada", "mensagem_enviada", "sem_resposta", "resposta_incompreensivel", "erro_envio"];
    const { data: item, error: itemError } = await supabase
      .from("escala_colaboradores")
      .select(`
        id,
        horario_inicio,
        tentativas_incompreensiveis,
        escalas!inner(id, data, empresas!inner(id, nome, tipo_contratacao)),
        colaboradores!inner(id, nome)
      `)
      .eq("colaborador_id", colaborador.id)
      .eq("escalas.data", today)
      .in("status_confirmacao", allowedStatuses)
      // Comunicados nao preenchem mensagem_enviada_em e nunca viram evidencia de confirmacao.
      .not("mensagem_enviada_em", "is", null)
      .lte("mensagem_enviada_em", receivedAt)
      .order("horario_inicio", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) return jsonResponse(200, {
      sucesso: true,
      ignorada: true,
      motivo: "Nenhuma mensagem anterior encontrada para esta resposta.",
    });

    let incomingMessageId = existingMessage.data?.id as string | undefined;
    const recordIncoming = async () => {
      if (incomingMessageId) return incomingMessageId;
      const result = await supabase.from("mensagens_recebidas").insert({
        escala_colaborador_id: item.id,
        colaborador_id: colaborador.id,
        whatsapp_message_id: payload.whatsapp_message_id || null,
        telefone_origem: payload.telefone_origem,
        mensagem_original: original,
        resposta_normalizada: normalized.resposta_normalizada,
        status_interpretado: normalized.tipo === "incompreensivel" ? "resposta_incompreensivel" : normalized.tipo,
        recebida_em: receivedAt,
      }).select("id").single();
      assertSupabaseResult(result);
      incomingMessageId = result.data.id;
      return incomingMessageId;
    };
    const markIncomingProcessed = async () => {
      const id = await recordIncoming();
      assertSupabaseResult(await supabase
        .from("mensagens_recebidas")
        .update({ processada_em: new Date().toISOString() })
        .eq("id", id));
    };

    if (!incomingMessageId) {
      await recordIncoming();
    }

    if (normalized.tipo === "confirmado") {
      assertSupabaseResult(await supabase.from("escala_colaboradores").update({
        status_confirmacao: "confirmado",
        resposta_normalizada: "sim",
        resposta_original: original,
        respondido_em: receivedAt,
      }).eq("id", item.id));

      assertSupabaseResult(await supabase.from("fila_mensagens").update({ status: "cancelada" })
        .eq("escala_colaborador_id", item.id)
        .eq("status", "pendente")
        .in("tipo", ["lembrete_1", "lembrete_2", "reenvio_manual", "alerta_sem_resposta"]));

      await markIncomingProcessed();
      await enqueueAutomaticReports(supabase);
      return jsonResponse(200, {
        sucesso: true,
        resposta: "confirmado",
        resposta_colaborador: confirmationReply(item.colaboradores.nome),
      });
    }

    if (normalized.tipo === "nao_comparecera") {
      assertSupabaseResult(await supabase.from("escala_colaboradores").update({
        status_confirmacao: "nao_comparecera",
        resposta_normalizada: "nao",
        resposta_original: original,
        respondido_em: receivedAt,
      }).eq("id", item.id));

      assertSupabaseResult(await supabase.from("fila_mensagens").update({ status: "cancelada" })
        .eq("escala_colaborador_id", item.id)
        .eq("status", "pendente")
        .in("tipo", ["lembrete_1", "lembrete_2", "reenvio_manual", "alerta_sem_resposta"]));

      const message = absenceAlert({
        colaboradorNome: item.colaboradores.nome,
        empresaNome: item.escalas.empresas.nome,
        data: item.escalas.data,
        horarioInicio: formatTime(item.horario_inicio),
        respondidoEm: receivedAt,
      });
      await enqueueDmrAlerts(supabase, item, "nao_comparecera", "alerta_nao_comparecera", message);

      await markIncomingProcessed();
      await enqueueAutomaticReports(supabase);
      return jsonResponse(200, {
        sucesso: true,
        resposta: "nao_comparecera",
        resposta_colaborador: absenceReply(item.colaboradores.nome, item.escalas.empresas.tipo_contratacao),
      });
    }

    const attempts = Number(item.tentativas_incompreensiveis ?? 0) + 1;
    assertSupabaseResult(await supabase.from("escala_colaboradores").update({
      status_confirmacao: "resposta_incompreensivel",
      resposta_original: original,
      tentativas_incompreensiveis: attempts,
      ultima_resposta_incompreensivel_em: receivedAt,
    }).eq("id", item.id));

    if (attempts >= 3) {
      const message = unclearAlert({
        colaboradorNome: item.colaboradores.nome,
        empresaNome: item.escalas.empresas.nome,
        data: item.escalas.data,
        horarioInicio: formatTime(item.horario_inicio),
        ultimaResposta: original,
      });
      await enqueueDmrAlerts(supabase, item, "resposta_incompreensivel", "alerta_resposta_incompreensivel", message);
    }

    await markIncomingProcessed();
    await enqueueAutomaticReports(supabase);
    return jsonResponse(200, {
      sucesso: true,
      resposta: "incompreensivel",
      resposta_colaborador: unclearGuidance(),
      tentativas_incompreensiveis: attempts,
    });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
